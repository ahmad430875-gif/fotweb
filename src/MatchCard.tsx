import { useState, type CSSProperties } from "react";
import { Bookmark, Clock3, Goal, Radio, Tv } from "lucide-react";
import type { Match } from "./data";
type MatchCardProps = {
  match: Match;
  competition?: string;
  isFavorite: boolean;
  onToggleFavorite: (matchId: string) => void;
};
function TeamBadge({
  abbreviation,
  color,
  secondaryColor,
}: {
  abbreviation: string;
  color: string;
  secondaryColor: string;
}) {
  return (
    <span
      className="team-badge"
      style={
        {
          "--team-color": color,
          "--team-secondary": secondaryColor,
        } as CSSProperties
      }
    >
      <span>{abbreviation.slice(0, 3)}</span>
    </span>
  );
}
function MatchCard({
  match,
  competition,
  isFavorite,
  onToggleFavorite,
}: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLive = match.status === "live" || match.status === "half-time";
  const hasScore =
    match.homeScore !== undefined && match.awayScore !== undefined;
  const tied = match.homeScore === match.awayScore;
  return (
    <article
      className={`match-card ${isLive ? "match-card-live" : ""} ${expanded ? "match-card-expanded" : ""}`}
    >
      {competition && (
        <span className="time-match-competition">{competition}</span>
      )}
      <button
        className="match-card-main"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span
          className={`match-status ${isLive ? "match-status-live" : ""} ${match.status === "finished" ? "match-status-finished" : ""}`}
        >
          {match.status === "live" ? (
            <>
              <span className="status-live-dot" />
              {match.minute}'
            </>
          ) : match.status === "half-time" ? (
            "HT"
          ) : match.status === "finished" ? (
            "FT"
          ) : (
            match.kickoff
          )}
        </span>
        <span
          className={`match-team ${hasScore && !tied && match.homeScore! < match.awayScore! ? "team-trailing" : ""}`}
        >
          <TeamBadge {...match.home} />
          <span className="team-name">{match.home.name}</span>
        </span>
        <span className={`match-score ${isLive ? "match-score-live" : ""}`}>
          {hasScore ? (
            <>
              <span>{match.homeScore}</span>
              <span className="score-separator">:</span>
              <span>{match.awayScore}</span>
            </>
          ) : (
            <>
              <span className="upcoming-dash">-</span>
              <span className="score-separator">:</span>
              <span className="upcoming-dash">-</span>
            </>
          )}
        </span>
        <span
          className={`match-team match-team-away ${hasScore && !tied && match.awayScore! < match.homeScore! ? "team-trailing" : ""}`}
        >
          <span className="team-name">{match.away.name}</span>
          <TeamBadge {...match.away} />
        </span>
        <span className="match-indicators">
          {match.events.some((event) => event.type === "goal") && (
            <Goal
              size={14}
              className="match-event-indicator"
              aria-label="Goal scored"
            />
          )}
          {match.events.some((event) => event.type === "yellow") && (
            <span
              className="card-indicator card-yellow"
              aria-label="Yellow card"
            />
          )}
          {match.events.some((event) => event.type === "red") && (
            <span className="card-indicator card-red" aria-label="Red card" />
          )}
          {match.tv && (
            <Tv
              size={14}
              className="tv-indicator"
              aria-label={`Broadcast on ${match.tv}`}
            />
          )}
        </span>
        <span className={`match-expand-chevron ${expanded ? "is-open" : ""}`}>
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="m6 3.5 4.5 4.5L6 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="match-details">
          <span className="match-details-time">
            <Clock3 size={13} />
            {isLive
              ? `In play · ${match.minute === "HT" ? "Half-time" : `${match.minute} minutes`}`
              : match.status === "finished"
                ? "Full-time"
                : `Kick-off at ${match.kickoff}`}
          </span>
          {match.events.length > 0 ? (
            <div className="match-timeline">
              {match.events.map((event, index) => (
                <span
                  className="timeline-event"
                  key={`${event.minute}-${event.player}-${index}`}
                >
                  <span className={`timeline-mark timeline-${event.type}`}>
                    {event.type === "goal" ? <Goal size={12} /> : null}
                  </span>
                  <span className="timeline-minute">{event.minute}</span>
                  <span
                    className={`timeline-player ${event.team === "away" ? "event-away" : ""}`}
                  >
                    {event.player}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span className="no-events">
              Line-ups and match events will appear here.
            </span>
          )}
          <div className="match-details-bottom">
            <span>
              {match.tv ? (
                <>
                  <Radio size={13} />
                  {match.tv}
                </>
              ) : (
                "Match centre"
              )}
            </span>
            <button
              type="button"
              className={`save-match-button ${isFavorite ? "is-saved" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(match.id);
              }}
            >
              <Bookmark size={14} fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "Saved" : "Follow match"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
export default MatchCard;
