import Link from "next/link";

/**
 * 灶火 ZaoHuo 全站頁首
 *
 * nav 對應三段 AI 與作品集；陪做／評分／我的廚房為後續 Phase，
 * 目前錨點到首頁對應區塊或標示待開發，不做假功能。
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-brand-border/60 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-serif text-lg font-bold text-white">
            灶
          </span>
          <span className="font-serif text-lg font-bold text-ink">
            灶火 <span className="tracking-wide text-ink-soft">ZaoHuo</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          <Link href="/#select" className="hover:text-ink">
            選菜
          </Link>
          <Link href="/#teach" className="hover:text-ink">
            陪做
          </Link>
          <Link href="/#judge" className="hover:text-ink">
            評分
          </Link>
          <Link href="/#kitchen" className="hover:text-ink">
            我的廚房
          </Link>
        </nav>

        <Link
          href="/#select"
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark"
        >
          開始做菜
        </Link>
      </div>
    </header>
  );
}
