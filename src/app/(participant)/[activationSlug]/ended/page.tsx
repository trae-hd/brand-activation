export default function EndedPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-5 pt-5 pb-8 min-h-screen">
      <div className="mb-5 text-sm font-semibold tracking-tight">
        MrQ <span className="font-normal text-ink-3">live</span>
      </div>
      <div className="rounded-md border border-border/50 bg-muted/30 p-4">
        <h1 className="mb-2 text-xl font-bold">This event has wrapped.</h1>
        <p className="text-sm text-ink-3">
          Catch the next one — find us at{" "}
          <a href="https://mrq.com/live" className="underline">
            mrq.com/live
          </a>
          .
        </p>
      </div>
    </main>
  );
}
