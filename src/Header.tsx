import { useState } from "react";
import {
  Goal,
  Moon,
  Newspaper,
  Search,
  Settings2,
  Sun,
  Trophy,
  Tv,
  X,
} from "lucide-react";
import type { Tab } from "./data";
type HeaderProps = {
  theme: "light" | "dark";
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onToggleTheme: () => void;
  onShowTV: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};
const tabs: { id: Tab; label: string; icon: typeof Goal }[] = [
  { id: "matches", label: "Matches", icon: Goal },
  { id: "leagues", label: "Leagues", icon: Trophy },
  { id: "news", label: "News", icon: Newspaper },
];
function Header({
  theme,
  activeTab,
  onTabChange,
  onToggleTheme,
  onShowTV,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          href="#matches"
          className="brand-lockup"
          aria-label="Touchline home"
          onClick={() => onTabChange("matches")}
        >
          <span className="brand-icon">
            <Goal size={23} strokeWidth={1.8} />
          </span>
          <span className="brand-word">
            touchline<span>.</span>
            <span className="brand-edition">
              THE BEAUTIFUL GAME, IN REAL TIME
            </span>
          </span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`top-nav-button ${activeTab === id ? "top-nav-button-active" : ""}`}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => onTabChange(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="header-link tv-guide-link"
            onClick={onShowTV}
          >
            <Tv size={16} />
            <span>TV guide</span>
          </button>
          <div
            className={`header-search ${searchOpen ? "header-search-open" : ""}`}
          >
            {searchOpen && (
              <input
                autoFocus
                type="search"
                placeholder="Find a team, league or story"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                aria-label="Search teams, leagues, and stories"
              />
            )}
            <button
              type="button"
              className="header-icon-button"
              title={searchOpen ? "Close search" : "Search"}
              aria-label={searchOpen ? "Close search" : "Search"}
              onClick={() => {
                setSearchOpen((current) => !current);
                if (searchOpen) onSearchChange("");
              }}
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
          </div>
          <div className="settings-wrap">
            <button
              type="button"
              className="header-icon-button settings-trigger"
              title="Display settings"
              aria-label="Display settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <Settings2 size={18} />
            </button>
            {settingsOpen && (
              <div className="settings-popover">
                <span className="settings-caption">APPEARANCE</span>
                <button
                  type="button"
                  className="theme-option"
                  onClick={onToggleTheme}
                >
                  {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
                  <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
                  <span
                    className="settings-switch"
                    data-active={theme === "dark"}
                  />
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="theme-toggle header-icon-button"
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            onClick={onToggleTheme}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
export default Header;
