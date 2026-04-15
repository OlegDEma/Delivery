import { Bot, Context, session, SessionFlavor, Keyboard, InlineKeyboard } from 'grammy';
import { PrismaClient } from '../generated/prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizePhone } from '../lib/utils/phone';
import { formatDate, formatWeight, formatCurrency } from '../lib/utils/format';

// ============================================================
// Types
// ============================================================

interface SessionData {
  role: 'client' | 'courier' | 'admin' | null;
  clientId: string | null;
  profileId: string | null;
  phone: string | null;
  step: string | null;
  orderData: Record<string, string>;
}

type MyContext = Context & SessionFlavor<SessionData>;

// ============================================================
// Init
// ============================================================

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const bot = new Bot<MyContext>(token);

bot.use(session({
  initial: (): SessionData => ({
    role: null, clientId: null, profileId: null, phone: null,
    step: null, orderData: {},
  }),
}));

// ============================================================
// Auth middleware
// ============================================================

async function resolveUser(ctx: MyContext, phone: string) {
  const normalized = normalizePhone(phone);

  // Check if profile (worker/admin)
  const profile = await prisma.profile.findFirst({
    where: { phone: { contains: normalized } },
  });

  if (profile) {
    ctx.session.profileId = profile.id;
    ctx.session.phone = phone;

    if (profile.role === 'super_admin' || profile.role === 'admin') {
      ctx.session.role = 'admin';
    } else if (profile.role === 'driver_courier' || profile.role === 'warehouse_worker') {
      ctx.session.role = 'courier';
    } else {
      ctx.session.role = 'client';
    }
  }

  // Check if client
  const client = await prisma.client.findFirst({
    where: { phoneNormalized: { contains: normalized } },
  });

  if (client) {
    ctx.session.clientId = client.id;
    if (!ctx.session.role) ctx.session.role = 'client';
  }

  // New client — create
  if (!client && !profile) {
    const name = ctx.from?.first_name || 'Клієнт';
    const lastName = ctx.from?.last_name || '';
    const newClient = await prisma.client.create({
      data: {
        phone,
        phoneNormalized: normalized,
        firstName: name,
        lastName: lastName || name,
      },
    });
    ctx.session.clientId = newClient.id;
    ctx.session.role = 'client';
  }

  ctx.session.phone = phone;
}

// ============================================================
// /start
// ============================================================

bot.command('start', async (ctx) => {
  if (ctx.session.role) {
    return sendMainMenu(ctx);
  }

  const kb = new Keyboard()
    .requestContact('📱 Поділитись номером телефону')
    .resized()
    .oneTime();

  await ctx.reply(
    '👋 Вітаю! Це бот служби доставки Delivery.\n\n' +
    'Для початку роботи поділіться своїм номером телефону:',
    { reply_markup: kb }
  );
});

// Handle contact share
bot.on('message:contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  await resolveUser(ctx, phone.startsWith('+') ? phone : `+${phone}`);
  await sendMainMenu(ctx);
});

// ============================================================
// Main menu by role
// ============================================================

async function sendMainMenu(ctx: MyContext) {
  const role = ctx.session.role;

  if (role === 'admin') {
    const kb = new InlineKeyboard()
      .text('📦 Посилки сьогодні', 'admin_today')
      .text('📊 Статистика', 'admin_stats').row()
      .text('💰 Борги', 'admin_debts')
      .text('🚛 Рейси', 'admin_trips').row()
      .text('🔍 Знайти посилку', 'find_parcel')
      .text('👥 Топ клієнтів', 'admin_top').row();

    await ctx.reply(
      `👔 Привіт, адмін!\nРоль: ${ctx.session.role}\nТелефон: ${ctx.session.phone}`,
      { reply_markup: kb }
    );
  } else if (role === 'courier') {
    const kb = new InlineKeyboard()
      .text('🗺 Мій маршрут', 'courier_route')
      .text('📦 Мої посилки', 'courier_parcels').row()
      .text('✅ Доставлено', 'courier_delivered')
      .text('📷 Фото', 'courier_photo').row()
      .text('💰 Каса', 'courier_cash')
      .text('🔍 Знайти посилку', 'find_parcel').row();

    await ctx.reply(
      `🚗 Привіт, кур'єр!\nТелефон: ${ctx.session.phone}`,
      { reply_markup: kb }
    );
  } else {
    const kb = new InlineKeyboard()
      .text('🔍 Відстежити посилку', 'track_parcel')
      .text('📦 Мої посилки', 'client_parcels').row()
      .text('📝 Нове замовлення', 'client_new_order')
      .text('💶 Розрахувати вартість', 'client_price').row();

    await ctx.reply(
      `👋 Привіт!\nТелефон: ${ctx.session.phone}\n\nОберіть дію:`,
      { reply_markup: kb }
    );
  }
}

// ============================================================
// Track parcel (all roles)
// ============================================================

bot.callbackQuery('track_parcel', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'waiting_track_number';
  await ctx.reply('🔍 Введіть номер посилки (ІТН або внутрішній номер):');
});

bot.callbackQuery('find_parcel', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'waiting_track_number';
  await ctx.reply('🔍 Введіть номер, ТТН, прізвище або телефон:');
});

// ============================================================
// Client: my parcels
// ============================================================

bot.callbackQuery('client_parcels', async (ctx) => {
  await ctx.answerCallbackQuery();

  if (!ctx.session.clientId) {
    return ctx.reply('❌ Клієнт не знайдений');
  }

  const parcels = await prisma.parcel.findMany({
    where: {
      OR: [{ senderId: ctx.session.clientId }, { receiverId: ctx.session.clientId }],
    },
    include: {
      receiver: { select: { lastName: true, firstName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (parcels.length === 0) {
    return ctx.reply('📭 У вас ще немає посилок');
  }

  const STATUS_MAP: Record<string, string> = {
    draft: '📝', accepted_for_transport_to_ua: '📦', in_transit_to_ua: '🚛',
    at_lviv_warehouse: '🏭', at_nova_poshta: '📮', delivered_ua: '✅',
    accepted_for_transport_to_eu: '📦', in_transit_to_eu: '🚛', delivered_eu: '✅',
    not_received: '❌', refused: '🚫', returned: '↩️',
  };

  let text = '📦 *Ваші посилки:*\n\n';
  for (const p of parcels) {
    const emoji = STATUS_MAP[p.status] || '📦';
    text += `${emoji} \`${p.internalNumber}\`\n`;
    text += `   → ${p.receiver.lastName} ${p.receiver.firstName}\n`;
    text += `   ${formatDate(p.createdAt)}\n\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Client: calculate price
// ============================================================

bot.callbackQuery('client_price', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'waiting_price_weight';
  await ctx.reply('⚖️ Введіть вагу посилки в кг (наприклад: 5.5):');
});

// ============================================================
// Courier: my route
// ============================================================

bot.callbackQuery('courier_route', async (ctx) => {
  await ctx.answerCallbackQuery();

  if (!ctx.session.profileId) return ctx.reply('❌ Профіль не знайдений');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const parcels = await prisma.parcel.findMany({
    where: {
      assignedCourierId: ctx.session.profileId,
      createdAt: { gte: today, lt: tomorrow },
    },
    include: {
      receiver: { select: { lastName: true, firstName: true, phone: true } },
      receiverAddress: { select: { city: true, street: true, building: true, postalCode: true, landmark: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (parcels.length === 0) {
    return ctx.reply('📭 На сьогодні немає посилок в маршруті');
  }

  let text = `🗺 *Маршрут на ${formatDate(new Date())}*\n${parcels.length} адрес\n\n`;

  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    const addr = p.receiverAddress;
    text += `*${i + 1}.* \`${p.internalNumber}\`\n`;
    text += `   👤 ${p.receiver.lastName} ${p.receiver.firstName}\n`;
    text += `   📞 ${p.receiver.phone}\n`;
    if (addr) {
      text += `   📍 ${addr.postalCode || ''} ${addr.city}`;
      if (addr.street) text += `, ${addr.street}`;
      if (addr.building) text += ` ${addr.building}`;
      if (addr.landmark) text += ` _(${addr.landmark})_`;
      text += '\n';
    }
    text += '\n';
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Courier: my parcels
// ============================================================

bot.callbackQuery('courier_parcels', async (ctx) => {
  await ctx.answerCallbackQuery();

  const parcels = await prisma.parcel.findMany({
    where: { assignedCourierId: ctx.session.profileId },
    include: { receiver: { select: { lastName: true, firstName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  if (parcels.length === 0) return ctx.reply('📭 Немає закріплених посилок');

  let text = `📦 *Мої посилки (${parcels.length}):*\n\n`;
  const totalWeight = parcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);

  for (const p of parcels) {
    const paid = p.isPaid ? '💚' : '🔴';
    text += `${paid} \`${p.internalNumber}\` ${Number(p.totalWeight || 0).toFixed(1)}кг\n`;
  }
  text += `\n⚖️ Загальна вага: *${formatWeight(totalWeight)}*`;

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Courier: mark delivered
// ============================================================

bot.callbackQuery('courier_delivered', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'waiting_delivered_number';
  await ctx.reply('✅ Введіть номер посилки яку доставили:');
});

// ============================================================
// Courier: cash
// ============================================================

bot.callbackQuery('courier_cash', async (ctx) => {
  await ctx.answerCallbackQuery();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entries = await prisma.cashRegister.findMany({
    where: {
      receivedById: ctx.session.profileId!,
      createdAt: { gte: today },
    },
  });

  const totalEUR = entries.filter(e => e.currency === 'EUR' && e.paymentType === 'income')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalUAH = entries.filter(e => e.currency === 'UAH' && e.paymentType === 'income')
    .reduce((s, e) => s + Number(e.amount), 0);

  await ctx.reply(
    `💰 *Каса за сьогодні:*\n\n` +
    `EUR: *${formatCurrency(totalEUR, 'EUR')}*\n` +
    `UAH: *${formatCurrency(totalUAH, 'UAH')}*\n` +
    `Записів: ${entries.length}`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================
// Courier: photo
// ============================================================

bot.callbackQuery('courier_photo', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = 'waiting_photo_number';
  await ctx.reply('📷 Введіть номер посилки для фото:');
});

// ============================================================
// Admin: today
// ============================================================

bot.callbackQuery('admin_today', async (ctx) => {
  await ctx.answerCallbackQuery();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.parcel.count({ where: { createdAt: { gte: today } } });
  const atWarehouse = await prisma.parcel.count({ where: { status: 'at_lviv_warehouse' } });
  const inTransit = await prisma.parcel.count({ where: { status: { in: ['in_transit_to_ua', 'in_transit_to_eu'] } } });

  await ctx.reply(
    `📦 *Сьогодні:*\n\n` +
    `Створено: *${count}*\n` +
    `На складі: *${atWarehouse}*\n` +
    `В дорозі: *${inTransit}*`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================
// Admin: stats
// ============================================================

bot.callbackQuery('admin_stats', async (ctx) => {
  await ctx.answerCallbackQuery();

  const total = await prisma.parcel.count();
  const clients = await prisma.client.count();
  const revenue = await prisma.parcel.aggregate({ where: { isPaid: true }, _sum: { totalCost: true } });

  await ctx.reply(
    `📊 *Статистика:*\n\n` +
    `Всього посилок: *${total}*\n` +
    `Клієнтів: *${clients}*\n` +
    `Дохід: *${formatCurrency(Number(revenue._sum.totalCost) || 0, 'EUR')}*`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================
// Admin: debts
// ============================================================

bot.callbackQuery('admin_debts', async (ctx) => {
  await ctx.answerCallbackQuery();

  const unpaid = await prisma.parcel.findMany({
    where: { isPaid: false, totalCost: { gt: 0 }, status: { notIn: ['draft', 'returned'] } },
    include: { receiver: { select: { lastName: true, firstName: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  if (unpaid.length === 0) return ctx.reply('✅ Всі оплачено!');

  const total = unpaid.reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
  let text = `🔴 *Борги (${unpaid.length} посилок, ${formatCurrency(total, 'EUR')}):*\n\n`;

  for (const p of unpaid) {
    text += `\`${p.internalNumber}\` — *${Number(p.totalCost || 0).toFixed(2)} EUR*\n`;
    text += `   ${p.receiver.lastName} ${p.receiver.phone}\n\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Admin: trips
// ============================================================

bot.callbackQuery('admin_trips', async (ctx) => {
  await ctx.answerCallbackQuery();

  const trips = await prisma.trip.findMany({
    where: { status: { in: ['planned', 'in_progress'] } },
    include: { _count: { select: { parcels: true } }, assignedCourier: { select: { fullName: true } } },
    orderBy: { departureDate: 'asc' },
    take: 5,
  });

  if (trips.length === 0) return ctx.reply('📭 Немає активних рейсів');

  let text = '🚛 *Активні рейси:*\n\n';
  for (const t of trips) {
    const status = t.status === 'in_progress' ? '🟡 В дорозі' : '🔵 Заплановано';
    text += `${status} *${t.country}* ${t.direction === 'eu_to_ua' ? '→UA' : '←UA'}\n`;
    text += `   📅 ${formatDate(t.departureDate)} | 📦 ${t._count.parcels} пос.\n`;
    if (t.assignedCourier) text += `   👤 ${t.assignedCourier.fullName}\n`;
    text += '\n';
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Admin: top clients
// ============================================================

bot.callbackQuery('admin_top', async (ctx) => {
  await ctx.answerCallbackQuery();

  const clients = await prisma.client.findMany({
    include: { _count: { select: { sentParcels: true, receivedParcels: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const sorted = clients
    .map(c => ({ ...c, total: c._count.sentParcels + c._count.receivedParcels }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  let text = '👥 *Топ-10 клієнтів:*\n\n';
  sorted.forEach((c, i) => {
    const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`;
    text += `${medal} *${c.lastName} ${c.firstName}* — ${c.total} пос.\n   📞 ${c.phone}\n\n`;
  });

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================================
// Text message handler (steps)
// ============================================================

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  // Track parcel
  if (step === 'waiting_track_number') {
    ctx.session.step = null;

    const q = text;
    const baseItn = q.includes('-') ? q.split('-')[0] : null;

    const parcel = await prisma.parcel.findFirst({
      where: {
        OR: [
          { itn: q },
          ...(baseItn ? [{ itn: baseItn }] : []),
          { internalNumber: { contains: q, mode: 'insensitive' as const } },
          { npTtn: q },
          { places: { some: { itnPlace: q } } },
        ],
      },
      include: {
        sender: { select: { lastName: true, firstName: true, phone: true } },
        receiver: { select: { lastName: true, firstName: true, phone: true } },
        receiverAddress: { select: { city: true, street: true, npWarehouseNum: true } },
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 5 },
      },
    });

    if (!parcel) {
      return ctx.reply('❌ Посилку не знайдено. Спробуйте ще раз або натисніть /start');
    }

    const STATUS_LABELS: Record<string, string> = {
      draft: '📝 Створена', accepted_for_transport_to_ua: '📦 Прийнято (→UA)',
      in_transit_to_ua: '🚛 В дорозі (→UA)', at_lviv_warehouse: '🏭 На складі Львів',
      at_nova_poshta: '📮 На Новій пошті', delivered_ua: '✅ Доставлено (UA)',
      accepted_for_transport_to_eu: '📦 Прийнято (→EU)', in_transit_to_eu: '🚛 В дорозі (→EU)',
      delivered_eu: '✅ Доставлено (EU)', not_received: '❌ Не отримано', refused: '🚫 Відмова',
    };

    let msg = `📦 *Посилка ${parcel.internalNumber}*\n`;
    msg += `Статус: *${STATUS_LABELS[parcel.status] || parcel.status}*\n\n`;
    msg += `👤 Від: ${parcel.sender.lastName} ${parcel.sender.firstName}\n`;
    msg += `📞 ${parcel.sender.phone}\n\n`;
    msg += `👤 Кому: ${parcel.receiver.lastName} ${parcel.receiver.firstName}\n`;
    msg += `📞 ${parcel.receiver.phone}\n`;
    if (parcel.receiverAddress) {
      msg += `📍 ${parcel.receiverAddress.city}`;
      if (parcel.receiverAddress.street) msg += `, ${parcel.receiverAddress.street}`;
      if (parcel.receiverAddress.npWarehouseNum) msg += ` | НП №${parcel.receiverAddress.npWarehouseNum}`;
      msg += '\n';
    }
    msg += `\n⚖️ Вага: ${parcel.totalWeight ? formatWeight(Number(parcel.totalWeight)) : '—'}\n`;
    if (parcel.npTtn) msg += `📮 ТТН НП: \`${parcel.npTtn}\`\n`;
    msg += `📅 ${formatDate(parcel.createdAt)}\n`;

    if (parcel.statusHistory.length > 0) {
      msg += '\n📋 *Історія:*\n';
      for (const h of parcel.statusHistory) {
        msg += `  ${STATUS_LABELS[h.status] || h.status} — ${formatDate(h.changedAt)}\n`;
      }
    }

    // Courier actions
    if (ctx.session.role === 'courier' || ctx.session.role === 'admin') {
      const kb = new InlineKeyboard()
        .text('✅ Доставлено', `deliver_${parcel.id}`)
        .text('❌ Не отримано', `notreceived_${parcel.id}`);
      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    return;
  }

  // Delivered
  if (step === 'waiting_delivered_number') {
    ctx.session.step = null;
    const parcel = await prisma.parcel.findFirst({
      where: {
        OR: [
          { itn: { contains: text } },
          { internalNumber: { contains: text, mode: 'insensitive' } },
        ],
      },
    });
    if (!parcel) return ctx.reply('❌ Посилку не знайдено');

    const newStatus = parcel.direction === 'ua_to_eu' ? 'delivered_eu' : 'delivered_ua';
    await prisma.parcel.update({
      where: { id: parcel.id },
      data: {
        status: newStatus as import('../generated/prisma/client').ParcelStatus,
        statusHistory: {
          create: {
            status: newStatus as import('../generated/prisma/client').ParcelStatus,
            changedById: ctx.session.profileId,
            notes: 'Доставлено через Telegram бот',
          },
        },
      },
    });
    await ctx.reply(`✅ Посилку \`${parcel.internalNumber}\` позначено як доставлену!`, { parse_mode: 'Markdown' });
    return;
  }

  // Price calculation
  if (step === 'waiting_price_weight') {
    ctx.session.step = null;
    const weight = Number(text);
    if (isNaN(weight) || weight <= 0) return ctx.reply('❌ Введіть число більше 0');

    const configs = await prisma.pricingConfig.findMany({ where: { isActive: true } });
    let msg = `💶 *Розрахунок для ${weight} кг:*\n\n`;
    for (const c of configs) {
      const cost = weight * Number(c.pricePerKg);
      msg += `${c.country} ${c.direction === 'eu_to_ua' ? '→UA' : '←UA'}: *${cost.toFixed(2)} EUR*\n`;
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
    return;
  }

  // Photo number
  if (step === 'waiting_photo_number') {
    ctx.session.orderData.photoParcelNumber = text;
    ctx.session.step = 'waiting_photo_file';
    await ctx.reply('📷 Тепер надішліть фото:');
    return;
  }

  // Default — try to track
  if (text.length >= 5) {
    ctx.session.step = 'waiting_track_number';
    // Re-trigger with the same text
    const fakeCtx = { ...ctx, message: { ...ctx.message, text } };
    return bot.handleUpdate({ ...ctx.update, message: fakeCtx.message });
  }

  await ctx.reply('🤔 Не зрозумів. Натисніть /start для головного меню.');
});

// ============================================================
// Inline button actions (deliver/not received)
// ============================================================

bot.callbackQuery(/^deliver_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const parcelId = ctx.match![1];

  const parcel = await prisma.parcel.findUnique({ where: { id: parcelId } });
  if (!parcel) return ctx.reply('❌ Посилку не знайдено');

  const newStatus = parcel.direction === 'ua_to_eu' ? 'delivered_eu' : 'delivered_ua';
  await prisma.parcel.update({
    where: { id: parcelId },
    data: {
      status: newStatus as import('../generated/prisma/client').ParcelStatus,
      statusHistory: {
        create: {
          status: newStatus as import('../generated/prisma/client').ParcelStatus,
          changedById: ctx.session.profileId,
          notes: 'Доставлено через Telegram бот',
        },
      },
    },
  });
  await ctx.reply(`✅ Посилку доставлено!`);
});

bot.callbackQuery(/^notreceived_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const parcelId = ctx.match![1];

  await prisma.parcel.update({
    where: { id: parcelId },
    data: {
      status: 'not_received',
      statusHistory: {
        create: {
          status: 'not_received',
          changedById: ctx.session.profileId,
          notes: 'Не отримано (через Telegram бот)',
        },
      },
    },
  });
  await ctx.reply(`❌ Посилку позначено як не отриману`);
});

// ============================================================
// Photo handler
// ============================================================

bot.on('message:photo', async (ctx) => {
  if (ctx.session.step !== 'waiting_photo_file') {
    return ctx.reply('📷 Щоб прикріпити фото, спочатку натисніть кнопку "Фото" і введіть номер посилки.');
  }

  ctx.session.step = null;
  const number = ctx.session.orderData.photoParcelNumber;

  const parcel = await prisma.parcel.findFirst({
    where: {
      OR: [
        { itn: { contains: number || '' } },
        { internalNumber: { contains: number || '', mode: 'insensitive' } },
      ],
    },
  });

  if (!parcel) return ctx.reply('❌ Посилку не знайдено');

  // Get file URL from Telegram
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // highest resolution
  const file = await ctx.api.getFile(photo.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

  // Add to parcel photos
  const photos = [...(parcel.photos || []), fileUrl];
  await prisma.parcel.update({
    where: { id: parcel.id },
    data: { photos },
  });

  await ctx.reply(`✅ Фото додано до посилки \`${parcel.internalNumber}\``, { parse_mode: 'Markdown' });
});

// ============================================================
// Menu command
// ============================================================

bot.command('menu', sendMainMenu);

// ============================================================
// Export & Start
// ============================================================

export { bot, prisma };

// Start polling if run directly
if (require.main === module) {
  console.log('🤖 Bot starting...');
  bot.start({
    onStart: () => console.log('✅ Bot is running!'),
  });
}
