import { type CSSProperties, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  Goal,
  Trophy,
  X,
} from "lucide-react";
import "./App.css";
import BottomNav from "./BottomNav";
import DateSelector from "./DateSelector";
import Header from "./Header";
import MatchCard from "./MatchCard";
import NewsSidebar from "./NewsSidebar";
import { articles, leagues } from "./data";
import type { Article, League, Tab } from "./data";

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("matches");
  const [today] = useState(() => localDateString(new Date()));
  const [date, setDate] = useState(today);
  const [liveOnly, setLiveOnly] = useState(false);
  const [tvOnly, setTvOnly] = useState(false);
  const [sortByTime, setSortByTime] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleLeagueIds, setVisibleLeagueIds] = useState(
    leagues.map((league) => league.id),
  );
  const [collapsedLeagues, setCollapsedLeagues] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savedArticles, setSavedArticles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("touchline-theme") === "dark" ? "dark" : "light",
  );
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const dayOffset = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );
  const fixtureLeagues = useMemo(
    () =>
      dayOffset === 0
        ? leagues
        : leagues.map((league) => ({
            ...league,
            matches: league.matches.map((match) => {
              if (dayOffset > 0)
                return {
                  ...match,
                  status: "upcoming" as const,
                  homeScore: undefined,
                  awayScore: undefined,
                  minute: undefined,
                  events: [],
                };
              const fallbackScore = match.id.charCodeAt(0) % 3;
              return {
                ...match,
                status: "finished" as const,
                homeScore: match.homeScore ?? fallbackScore,
                awayScore: match.awayScore ?? (fallbackScore + 1) % 3,
                minute: "FT",
                events: match.events,
              };
            }),
          })),
    [dayOffset],
  );
  const matchingLeagues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return fixtureLeagues
      .filter((league) => visibleLeagueIds.includes(league.id))
      .map((league) => ({
        ...league,
        matches: league.matches.filter((match) => {
          const statusMatch =
            !liveOnly ||
            match.status === "live" ||
            match.status === "half-time";
          const tvMatch = !tvOnly || Boolean(match.tv);
          const searchMatch =
            !query ||
            `${match.home.name} ${match.away.name} ${league.name} ${league.country}`
              .toLowerCase()
              .includes(query);
          return statusMatch && tvMatch && searchMatch;
        }),
      }))
      .map((league) => ({
        ...league,
        matches: sortByTime
          ? [...league.matches].sort((a, b) =>
              a.kickoff.localeCompare(b.kickoff),
            )
          : league.matches,
      }))
      .filter((league) => league.matches.length > 0);
  }, [
    fixtureLeagues,
    liveOnly,
    searchQuery,
    sortByTime,
    tvOnly,
    visibleLeagueIds,
  ]);
  const searchedArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return articles.filter(
      (article) =>
        !query ||
        `${article.title} ${article.source}`.toLowerCase().includes(query),
    );
  }, [searchQuery]);
  const matchCount = matchingLeagues.reduce(
    (count, league) => count + league.matches.length,
    0,
  );
  const liveCount = fixtureLeagues.reduce(
    (count, league) =>
      count +
      league.matches.filter(
        (match) => match.status === "live" || match.status === "half-time",
      ).length,
    0,
  );
  const timedMatches = matchingLeagues
    .flatMap((league) => league.matches.map((match) => ({ league, match })))
    .sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));

  function toggleFavorite(id: string) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleSavedArticle(id: string) {
    setSavedArticles((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleLeague(id: string) {
    setVisibleLeagueIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem("touchline-theme", next);
      return next;
    });
  }

  function renderLeague(league: League) {
    const collapsed = collapsedLeagues.includes(league.id);
    const liveMatches = league.matches.filter(
      (match) => match.status === "live" || match.status === "half-time",
    ).length;
    return (
      <section className="league-section" key={league.id}>
        <button
          className="league-heading"
          type="button"
          onClick={() =>
            setCollapsedLeagues((current) =>
              collapsed
                ? current.filter((id) => id !== league.id)
                : [...current, league.id],
            )
          }
          aria-expanded={!collapsed}
        >
          <span className={`league-mark ${league.markClass}`}>
            <Trophy size={14} />
          </span>
          <span className="league-heading-copy">
            <span className="league-country">
              {league.country} <span>/</span> {league.division}
            </span>
            <span className="league-name">{league.name}</span>
          </span>
          <span className="league-summary">
            {liveMatches > 0 && (
              <span className="league-live">
                <CircleDot size={10} fill="currentColor" /> {liveMatches} LIVE
              </span>
            )}
            <span>{league.matches.length} matches</span>
            <ChevronRight
              className={collapsed ? "" : "chevron-open"}
              size={17}
            />
          </span>
        </button>
        {!collapsed && (
          <div className="league-matches">
            {league.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                isFavorite={favorites.includes(match.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderNews() {
    return (
      <section className="destination-view">
        <div className="destination-heading">
          <div>
            <span className="eyebrow">THE TOUCHLINE BRIEFING</span>
            <h1>
              Football, in focus<span>.</span>
            </h1>
          </div>
          <span className="destination-count">
            {searchedArticles.length} STORIES
          </span>
        </div>
        <div className="news-grid">
          {searchedArticles.map((article, index) => (
            <article
              className={`news-feature ${index === 0 ? "news-feature-lead" : ""}`}
              key={article.id}
            >
              <button
                className="news-image-button"
                type="button"
                onClick={() => setSelectedArticle(article)}
                aria-label={`Read ${article.title}`}
              >
                <img
                  className="news-feature-image"
                  src={article.image}
                  alt="Football matchday"
                />
                <span className="news-image-label">{article.category}</span>
              </button>
              <div className="news-feature-copy">
                <div className="article-meta">
                  <span>{article.source}</span>
                  <span>{article.timeAgo}</span>
                </div>
                <button
                  type="button"
                  className="article-title-button"
                  onClick={() => setSelectedArticle(article)}
                >
                  <h2>{article.title}</h2>
                </button>
                <p>{article.summary}</p>
                <div className="feature-actions">
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setSelectedArticle(article)}
                  >
                    Read story <ArrowUpRight size={15} />
                  </button>
                  <button
                    type="button"
                    className={`icon-action ${savedArticles.includes(article.id) ? "is-saved" : ""}`}
                    title="Save story"
                    onClick={() => toggleSavedArticle(article.id)}
                  >
                    <Bookmark
                      size={17}
                      fill={
                        savedArticles.includes(article.id)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderLeagues() {
    return (
      <section className="destination-view">
        <div className="destination-heading">
          <div>
            <span className="eyebrow">THE 2026 / 27 SEASON</span>
            <h1>
              Every league<span>.</span>
            </h1>
          </div>
          <span className="destination-count">
            {leagues.length} COMPETITIONS
          </span>
        </div>
        <div className="league-directory">
          {leagues.map((league) => (
            <article className="league-directory-card" key={league.id}>
              <div className="directory-card-heading">
                <span className={`league-mark ${league.markClass}`}>
                  <Trophy size={16} />
                </span>
                <div>
                  <span className="league-country">
                    {league.country} / {league.division}
                  </span>
                  <h2>{league.name}</h2>
                </div>
                <span className="league-directory-live">
                  {league.matches.length} fixtures <ChevronRight size={16} />
                </span>
              </div>
              <table className="standings-table directory-standings">
                <thead>
                  <tr>
                    <th scope="col">POS</th>
                    <th scope="col">CLUB</th>
                    <th scope="col">GD</th>
                    <th scope="col">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {league.standings.slice(0, 5).map((team, index) => (
                    <tr key={team.name}>
                      <td className="standings-rank">
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <td>
                        <span className="table-team">
                          <span
                            className="table-team-monogram"
                            style={
                              { "--team-color": team.color } as CSSProperties
                            }
                          >
                            {team.abbreviation}
                          </span>
                          {team.name}
                        </span>
                      </td>
                      <td>
                        {team.goalDifference > 0
                          ? `+${team.goalDifference}`
                          : team.goalDifference}
                      </td>
                      <td className="standings-points">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="directory-link"
                type="button"
                onClick={() => {
                  setActiveTab("matches");
                  setLiveOnly(false);
                  setVisibleLeagueIds([league.id]);
                }}
              >
                View fixtures <ArrowUpRight size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell mx-auto w-full" data-theme={theme}>
      <Header
        theme={theme}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onToggleTheme={toggleTheme}
        onShowTV={() => {
          setActiveTab("matches");
          setTvOnly(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <main id="matches" className="page-layout">
        <div className="main-column">
          {activeTab === "matches" && (
            <>
              <div className="dashboard-heading">
                <div className="dashboard-title-group">
                  <span className="eyebrow">
                    <span className="eyebrow-dot" /> THE WORLD GAME, AS IT
                    HAPPENS
                  </span>
                  <h1>
                    Match centre<span>.</span>
                  </h1>
                </div>
                <div className="live-counter">
                  <span className="live-counter-pulse" />
                  <span>
                    <strong>{liveCount}</strong> live now
                  </span>
                  <span className="counter-divider" />
                  <span>{matchCount} matches</span>
                </div>
              </div>
              <DateSelector value={date} onChange={setDate} />
              <div className="filter-row">
                <div className="filter-pills">
                  <button
                    className={`filter-pill ${liveOnly ? "filter-pill-active" : ""}`}
                    type="button"
                    onClick={() => setLiveOnly((current) => !current)}
                    aria-pressed={liveOnly}
                  >
                    <span className="live-pill-dot" />
                    Live{liveOnly && <Check size={13} />}
                  </button>
                  <button
                    className={`filter-pill ${tvOnly ? "filter-pill-active" : ""}`}
                    type="button"
                    onClick={() => setTvOnly((current) => !current)}
                    aria-pressed={tvOnly}
                  >
                    On TV{tvOnly && <Check size={13} />}
                  </button>
                  <button
                    className={`filter-pill ${sortByTime ? "filter-pill-active" : ""}`}
                    type="button"
                    onClick={() => setSortByTime((current) => !current)}
                    aria-pressed={sortByTime}
                  >
                    By time <span className="sort-indicator">↕</span>
                  </button>
                </div>
                <div className="filter-menu-wrap">
                  <button
                    className={`filter-button ${filterOpen || visibleLeagueIds.length < leagues.length ? "filter-button-active" : ""}`}
                    type="button"
                    onClick={() => setFilterOpen((current) => !current)}
                    aria-expanded={filterOpen}
                  >
                    <Filter size={15} /> Filter
                    {visibleLeagueIds.length < leagues.length && (
                      <span className="filter-count">
                        {visibleLeagueIds.length}
                      </span>
                    )}
                  </button>
                  {filterOpen && (
                    <div className="filter-popover">
                      <div className="popover-heading">
                        <div>
                          <strong>Competitions</strong>
                          <span>Choose what to follow</span>
                        </div>
                        <button
                          type="button"
                          className="popover-reset"
                          onClick={() =>
                            setVisibleLeagueIds(
                              leagues.map((league) => league.id),
                            )
                          }
                        >
                          Reset
                        </button>
                      </div>
                      {leagues.map((league) => (
                        <label className="filter-option" key={league.id}>
                          <input
                            type="checkbox"
                            checked={visibleLeagueIds.includes(league.id)}
                            onChange={() => toggleLeague(league.id)}
                          />
                          <span
                            className={`league-mark filter-league-mark ${league.markClass}`}
                          >
                            <Trophy size={12} />
                          </span>
                          <span>{league.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="match-list-heading">
                <div>
                  <span className="section-kicker">
                    {date === today
                      ? "TODAY'S FIXTURES"
                      : dayOffset < 0
                        ? "COMPLETED FIXTURES"
                        : "UPCOMING FIXTURES"}
                  </span>
                  <span className="fixture-total">{matchCount} matches</span>
                </div>
                <button
                  className="display-mode"
                  type="button"
                  onClick={() => setSortByTime((current) => !current)}
                >
                  <Goal size={15} />{" "}
                  {sortByTime ? "Kick-off order" : "By competition"}
                </button>
              </div>
              <div className="league-list">
                {matchingLeagues.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-mark">
                      <Filter size={20} />
                    </div>
                    <strong>No matches found</strong>
                    <span>Try a different search or competition filter.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setLiveOnly(false);
                        setTvOnly(false);
                        setVisibleLeagueIds(leagues.map((league) => league.id));
                        setSearchQuery("");
                      }}
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : sortByTime ? (
                  <section className="league-section time-schedule">
                    <div className="time-section-heading">
                      <Clock3 size={15} />
                      <span>Kick-off order</span>
                      <span>ALL COMPETITIONS</span>
                    </div>
                    <div className="league-matches">
                      {timedMatches.map(({ league, match }) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          competition={league.name}
                          isFavorite={favorites.includes(match.id)}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  matchingLeagues.map(renderLeague)
                )}
              </div>
              <div className="bottom-note">
                <CircleDot size={12} fill="currentColor" />
                <span>Scores and fixtures for the selected matchday.</span>
                <span className="note-separator" />
                <span>Times shown in your local time.</span>
              </div>
            </>
          )}
          {activeTab === "news" && renderNews()}
          {activeTab === "leagues" && renderLeagues()}
        </div>
        <aside className="sidebar-column">
          <NewsSidebar
            savedArticles={savedArticles}
            onToggleSave={toggleSavedArticle}
            onOpenArticle={setSelectedArticle}
            onShowLeagues={() => setActiveTab("leagues")}
          />
          <div className="saved-count">
            <Bookmark
              size={13}
              fill={
                favorites.length || savedArticles.length
                  ? "currentColor"
                  : "none"
              }
            />
            {favorites.length + savedArticles.length > 0
              ? `${favorites.length + savedArticles.length} saved for later`
              : "Your matchday, all in one place"}
          </div>
        </aside>
      </main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      {filterOpen && (
        <button
          aria-label="Close filters"
          className="popover-dismiss"
          type="button"
          onClick={() => setFilterOpen(false)}
        />
      )}
      {selectedArticle && (
        <div
          className="story-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedArticle(null);
          }}
        >
          <article
            className="story-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-title"
          >
            <button
              className="story-close"
              type="button"
              aria-label="Close story"
              onClick={() => setSelectedArticle(null)}
            >
              <X size={19} />
            </button>
            <img src={selectedArticle.image} alt="Football matchday" />
            <div className="story-body">
              <div className="article-meta">
                <span>{selectedArticle.source}</span>
                <span>{selectedArticle.timeAgo}</span>
              </div>
              <span className="eyebrow">{selectedArticle.category}</span>
              <h2 id="story-title">{selectedArticle.title}</h2>
              <p>{selectedArticle.summary}</p>
              <p className="story-extra">
                From the tunnel to the final whistle, the season is gathering
                pace. Follow every result, reaction and turning point with the
                Touchline match centre.
              </p>
              <button
                type="button"
                className={`save-story-button ${savedArticles.includes(selectedArticle.id) ? "is-saved" : ""}`}
                onClick={() => toggleSavedArticle(selectedArticle.id)}
              >
                <Bookmark
                  size={16}
                  fill={
                    savedArticles.includes(selectedArticle.id)
                      ? "currentColor"
                      : "none"
                  }
                />
                {savedArticles.includes(selectedArticle.id)
                  ? "Saved to your reading list"
                  : "Save for later"}
              </button>
            </div>
          </article>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {matchCount} matches shown
      </span>
    </div>
  );
}

export default App;
