import { Goal, Newspaper, Trophy } from "lucide-react";
import type { Tab } from "./data";
type BottomNavProps = { activeTab: Tab; onChange: (tab: Tab) => void };
const items: { tab: Tab; label: string; icon: typeof Goal }[] = [
  { tab: "matches", label: "Matches", icon: Goal },
  { tab: "leagues", label: "Leagues", icon: Trophy },
  { tab: "news", label: "News", icon: Newspaper },
];
function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ tab, label, icon: Icon }) => (
        <button
          className={`bottom-nav-button ${activeTab === tab ? "bottom-nav-active" : ""}`}
          type="button"
          key={tab}
          onClick={() => {
            onChange(tab);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-current={activeTab === tab ? "page" : undefined}
        >
          <Icon size={19} strokeWidth={activeTab === tab ? 2.2 : 1.7} />
          <span>{label}</span>
          {activeTab === tab && <span className="bottom-nav-indicator" />}
        </button>
      ))}
    </nav>
  );
}
export default BottomNav;
