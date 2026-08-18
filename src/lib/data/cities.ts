/**
 * ТЗ docx 17.08.26 (Частина перша): при введенні МІСТА показувати підказки й ловити
 * помилки написання (напр. «Amshtetten» → «Amstetten»). Тут — вивірений словник
 * реальних населених пунктів по країнах, який зливається з історією адрес у
 * /api/addresses/suggest. Це НЕ повний реєстр усіх сіл — це найуживаніші міста та
 * містечка; повне покриття по Україні дає Nova Poshta (searchSettlements) при
 * наявному NP_API_KEY (див. suggest-ендпоінт).
 *
 * EU-назви — латиницею з правильним написанням (щоб автопідказка виправляла опечатки).
 */

const UA: string[] = [
  // Обласні центри + Київ
  'Київ', 'Львів', 'Харків', 'Одеса', 'Дніпро', 'Донецьк', 'Запоріжжя', 'Луганськ',
  'Вінниця', 'Миколаїв', 'Полтава', 'Чернігів', 'Черкаси', 'Житомир', 'Суми',
  'Хмельницький', 'Чернівці', 'Рівне', 'Кропивницький', 'Івано-Франківськ',
  'Тернопіль', 'Луцьк', 'Ужгород', 'Херсон', 'Сімферополь',
  // Великі міста
  'Кривий Ріг', 'Маріуполь', 'Макіївка', 'Севастополь', 'Камʼянське', 'Кременчук',
  'Біла Церква', 'Краматорськ', 'Мелітополь', 'Нікополь', 'Бердянськ', 'Словʼянськ',
  'Павлоград', 'Сєвєродонецьк', 'Лисичанськ', 'Мукачево', 'Умань', 'Бровари', 'Ірпінь',
  'Бориспіль', 'Фастів', 'Обухів', 'Вишневе', 'Буча', 'Вишгород',
  // Західна Україна (хаб — Львів)
  'Дрогобич', 'Трускавець', 'Стрий', 'Червоноград', 'Самбір', 'Борислав', 'Новий Розділ',
  'Золочів', 'Городок', 'Жовква', 'Броди', 'Сокаль', 'Яворів', 'Мостиська', 'Турка',
  'Коломия', 'Калуш', 'Долина', 'Надвірна', 'Бурштин', 'Болехів', 'Яремче', 'Косів',
  'Снятин', 'Городенка', 'Тлумач', 'Рогатин', 'Галич', 'Тисмениця',
  'Ковель', 'Нововолинськ', 'Володимир', 'Камінь-Каширський', 'Ківерці',
  'Дубно', 'Костопіль', 'Вараш', 'Сарни', 'Здолбунів',
  'Камʼянець-Подільський', 'Шепетівка', 'Славута', 'Нетішин', 'Старокостянтинів',
  'Берегове', 'Хуст', 'Виноградів', 'Тячів', 'Рахів', 'Свалява', 'Іршава',
  'Чортків', 'Бережани', 'Кременець', 'Бучач', 'Заліщики',
];

const NL: string[] = [
  'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg',
  'Almere', 'Breda', 'Nijmegen', 'Enschede', 'Haarlem', 'Arnhem', 'Zaanstad',
  'Amersfoort', 'Apeldoorn', '’s-Hertogenbosch', 'Hoofddorp', 'Maastricht', 'Leiden',
  'Dordrecht', 'Zoetermeer', 'Zwolle', 'Deventer', 'Delft', 'Alkmaar', 'Heerlen',
  'Venlo', 'Leeuwarden', 'Hilversum', 'Hengelo', 'Sittard', 'Roosendaal', 'Purmerend',
  'Oss', 'Schiedam', 'Spijkenisse', 'Vlaardingen', 'Almelo', 'Gouda', 'Bergen op Zoom',
  'Helmond', 'Emmen', 'Ede', 'Assen', 'Roermond', 'Nieuwegein', 'Veenendaal', 'Katwijk',
  'Doetinchem', 'Kerkrade', 'Barneveld', 'Zeist', 'Den Helder', 'Hardenberg', 'Weert',
  'Terneuzen', 'Middelburg', 'Vlissingen', 'Tiel', 'Woerden', 'Waalwijk', 'Kampen',
];

const AT: string[] = [
  'Wien', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels',
  'Sankt Pölten', 'Dornbirn', 'Wiener Neustadt', 'Steyr', 'Feldkirch', 'Bregenz',
  'Leonding', 'Klosterneuburg', 'Baden', 'Wolfsberg', 'Leoben', 'Krems an der Donau',
  'Traun', 'Amstetten', 'Kapfenberg', 'Lustenau', 'Hallein', 'Kufstein', 'Traiskirchen',
  'Schwechat', 'Braunau am Inn', 'Stockerau', 'Saalfelden', 'Ansfelden', 'Tulln an der Donau',
  'Hohenems', 'Spittal an der Drau', 'Telfs', 'Ternitz', 'Perchtoldsdorf', 'Feldkirchen',
  'Bludenz', 'Bad Ischl', 'Eisenstadt', 'Hall in Tirol', 'Schwaz', 'Gänserndorf',
  'Zwettl', 'Mödling', 'Korneuburg', 'Gmunden', 'Vöcklabruck', 'Ried im Innkreis',
  'Hörsching', 'Enns', 'Marchtrenk', 'Böheimkirchen', 'Neunkirchen', 'Wörgl',
];

const DE: string[] = [
  'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart',
  'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover',
  'Nürnberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster',
  'Karlsruhe', 'Mannheim', 'Augsburg', 'Wiesbaden', 'Mönchengladbach', 'Gelsenkirchen',
  'Aachen', 'Braunschweig', 'Chemnitz', 'Kiel', 'Halle', 'Magdeburg', 'Freiburg im Breisgau',
  'Krefeld', 'Mainz', 'Lübeck', 'Erfurt', 'Oberhausen', 'Rostock', 'Kassel', 'Hagen',
  'Potsdam', 'Saarbrücken', 'Hamm', 'Ludwigshafen am Rhein', 'Mülheim an der Ruhr',
  'Oldenburg', 'Osnabrück', 'Leverkusen', 'Heidelberg', 'Darmstadt', 'Solingen',
  'Regensburg', 'Ingolstadt', 'Würzburg', 'Fürth', 'Wolfsburg', 'Offenbach am Main',
  'Ulm', 'Heilbronn', 'Pforzheim', 'Göttingen', 'Bottrop', 'Reutlingen', 'Koblenz',
  'Bremerhaven', 'Bergisch Gladbach', 'Jena', 'Remscheid', 'Erlangen', 'Trier', 'Salzgitter',
  'Siegen', 'Cottbus', 'Hildesheim', 'Kaiserslautern', 'Gütersloh', 'Witten', 'Gera',
];

export const CITY_DICTIONARY: Record<'UA' | 'NL' | 'AT' | 'DE', string[]> = { UA, NL, AT, DE };

/**
 * Підказки міст зі словника: startsWith (нечутливо до регістру), до `limit` штук.
 * Порожній запит → нічого (щоб не вивалювати весь список на фокус).
 */
export function suggestCitiesFromDictionary(country: string, q: string, limit = 10): string[] {
  const list = CITY_DICTIONARY[country as 'UA' | 'NL' | 'AT' | 'DE'];
  if (!list) return [];
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const c of list) {
    const lc = c.toLowerCase();
    if (lc.startsWith(query)) starts.push(c);
    else if (lc.includes(query)) contains.push(c);
    if (starts.length >= limit) break;
  }
  // startsWith пріоритетніше; далі — «містить» (щоб «stetten» знайшло «Amstetten»).
  return [...starts, ...contains].slice(0, limit);
}
