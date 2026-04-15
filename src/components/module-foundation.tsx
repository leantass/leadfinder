type ModuleHighlight = {
  label: string;
  value: string;
  detail: string;
};

type ModuleSection = {
  title: string;
  description: string;
  items: string[];
};

type ModuleFoundationProps = {
  title: string;
  description: string;
  highlights: ModuleHighlight[];
  sections: ModuleSection[];
};

export function ModuleFoundation({
  title,
  description,
  highlights,
  sections,
}: ModuleFoundationProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
          Base del modulo
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
          {description}
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {highlights.map((highlight) => (
          <div
            key={highlight.label}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5"
          >
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              {highlight.label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {highlight.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {highlight.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6"
          >
            <h3 className="text-xl font-semibold text-white">{section.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {section.description}
            </p>

            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-3 text-sm leading-6 text-zinc-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
