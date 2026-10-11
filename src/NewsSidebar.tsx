import { type CSSProperties } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { Article } from "./data";
import { articles, leagues } from "./data";
type NewsSidebarProps = {
  savedArticles: string[];
  onToggleSave: (articleId: string) => void;
  onOpenArticle: (article: Article) => void;
  onShowLeagues: () => void;
};
function NewsSidebar({
  savedArticles,
  onToggleSave,
  onOpenArticle,
  onShowLeagues,
}: NewsSidebarProps) {
  const featured = articles.slice(0, 3);
  const standings = leagues[0].standings.slice(0, 5);
  return (
    <>
      <section className="sidebar-section news-sidebar-section">
        <div className="sidebar-title-row">
          <div>
            <span className="section-kicker">WHAT'S HAPPENING</span>
            <h2>Latest stories</h2>
          </div>
          <span className="sidebar-live-tag">
            <span /> UPDATING
          </span>
        </div>
        <div className="sidebar-feature">
          <button
            type="button"
            className="sidebar-feature-image"
            onClick={() => onOpenArticle(featured[0])}
          >
            <img
              src={featured[0].image}
              alt="Players during a football match"
            />
            <span className="image-tint-tag">THE BIG STORY</span>
          </button>
          <button
            type="button"
            className="sidebar-article-title"
            onClick={() => onOpenArticle(featured[0])}
          >
            {featured[0].title}
            <ArrowUpRight size={14} />
          </button>
          <div className="article-meta">
            <span>{featured[0].source}</span>
            <span>{featured[0].timeAgo}</span>
          </div>
        </div>
        <div className="sidebar-news-list">
          {featured.slice(1).map((article) => (
            <article className="sidebar-news-item" key={article.id}>
              <button
                type="button"
                className="sidebar-news-image"
                onClick={() => onOpenArticle(article)}
                aria-label={`Read ${article.title}`}
              >
                <img src={article.image} alt="Football ground" />
              </button>
              <div className="sidebar-news-copy">
                <span className="sidebar-news-category">
                  {article.category}
                </span>
                <button
                  type="button"
                  className="sidebar-news-link"
                  onClick={() => onOpenArticle(article)}
                >
                  {article.title}
                </button>
                <span className="sidebar-news-time">
                  {article.source} <span>/</span> {article.timeAgo}
                </span>
              </div>
              <button
                type="button"
                className={`sidebar-save ${savedArticles.includes(article.id) ? "is-saved" : ""}`}
                title="Save story"
                aria-label="Save story"
                onClick={() => onToggleSave(article.id)}
              >
                <Bookmark
                  size={15}
                  fill={
                    savedArticles.includes(article.id) ? "currentColor" : "none"
                  }
                />
              </button>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="sidebar-more-link"
          onClick={() => onOpenArticle(featured[2])}
        >
          More from the newsroom <ChevronRight size={14} />
        </button>
      </section>
      <section className="sidebar-section table-sidebar-section">
        <div className="sidebar-title-row">
          <div>
            <span className="section-kicker">TOP OF THE TABLE</span>
            <h2>Premier League</h2>
          </div>
          <span className="standings-icon">
            <Trophy size={17} />
          </span>
        </div>
        <div className="standings-caption">
          <span>2026 / 27</span>
          <span>AFTER 8 MATCHES</span>
        </div>
        <table className="standings-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">CLUB</th>
              <th scope="col">GD</th>
              <th scope="col">PTS</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => (
              <tr key={row.name}>
                <td>
                  <span
                    className={`standings-rank ${index === 0 ? "rank-top" : ""}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </td>
                <td>
                  <span className="table-team">
                    <span
                      className="table-team-monogram"
                      style={{ "--team-color": row.color } as CSSProperties}
                    >
                      {row.abbreviation}
                    </span>
                    {row.name}
                  </span>
                </td>
                <td>
                  {row.goalDifference > 0
                    ? `+${row.goalDifference}`
                    : row.goalDifference}
                </td>
                <td className="standings-points">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-row">
          <span>
            <TrendingUp size={13} /> FORM
          </span>
          {standings.map((row) => (
            <span
              className="form-result"
              key={row.name}
              title={`${row.name} in form`}
            >
              W
            </span>
          ))}
        </div>
        <button
          className="sidebar-more-link table-more-link"
          type="button"
          onClick={onShowLeagues}
        >
          Full table &amp; fixtures <ChevronRight size={14} />
        </button>
      </section>
      <div className="sidebar-edition">
        <span>TOUCHLINE / MATCHDAY 001</span>
        <span>Made for the love of the game.</span>
      </div>
    </>
  );
}
export default NewsSidebar;
