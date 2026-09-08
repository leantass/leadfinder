export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm font-medium text-cyan-400">LeadFinder</p>
        <h1 className="mt-2 text-2xl font-semibold">Acceso de operador</h1>
        <p className="mt-2 text-sm text-zinc-400">Ingresá para acceder al workspace privado.</p>
        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <label className="block text-sm">Usuario
            <input name="user" autoComplete="username" required maxLength={256} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3" />
          </label>
          <label className="block text-sm">Contraseña
            <input name="password" type="password" autoComplete="current-password" required maxLength={1024} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3" />
          </label>
          {error && <p role="alert" className="text-sm text-red-400">No se pudo iniciar sesión. Revisá tus credenciales e intentá nuevamente.</p>}
          <button type="submit" className="w-full rounded-lg bg-cyan-400 p-3 font-semibold text-zinc-950">Ingresar</button>
        </form>
      </section>
    </main>
  );
}
