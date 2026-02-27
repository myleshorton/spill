export default function Footer() {
  return (
    <footer className="border-t border-spill-border py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <span className="font-headline font-bold text-lg text-gradient">
            Spill
          </span>
          <a
            href="https://github.com/myleshorton/spill"
            target="_blank"
            rel="noopener noreferrer"
            className="text-spill-muted hover:text-spill-text text-sm transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://unredact.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-spill-muted hover:text-spill-text text-sm transition-colors"
          >
            unredact.org
          </a>
        </div>
        <p className="text-spill-muted text-sm">
          Built for the open internet.
        </p>
      </div>
    </footer>
  );
}
