'use client';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="uk">
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg border p-6 text-center">
            <h1 className="text-xl font-bold text-red-600 mb-2">Щось пішло не так</h1>
            <p className="text-sm text-gray-600 mb-4">Сталася помилка. Спробуйте ще раз.</p>
            <button onClick={reset} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Спробувати знову</button>
          </div>
        </div>
      </body>
    </html>
  );
}
