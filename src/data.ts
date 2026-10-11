export type MatchStatus = "live" | "half-time" | "finished" | "upcoming";
export type Tab = "matches" | "leagues" | "news";
export type Team = {
  name: string;
  abbreviation: string;
  color: string;
  secondaryColor: string;
};
export type MatchEvent = {
  minute: string;
  player: string;
  type: "goal" | "yellow" | "red";
  team: "home" | "away";
};
export type Match = {
  id: string;
  home: Team;
  away: Team;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  minute?: string;
  kickoff: string;
  tv?: string;
  events: MatchEvent[];
};
export type StandingsRow = {
  name: string;
  abbreviation: string;
  color: string;
  played: number;
  goalDifference: number;
  points: number;
};
export type League = {
  id: string;
  country: string;
  division: string;
  name: string;
  markClass: string;
  matches: Match[];
  standings: StandingsRow[];
};
export type Article = {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  timeAgo: string;
  image: string;
};

const team = (
  name: string,
  abbreviation: string,
  color: string,
  secondaryColor = "#fff",
): Team => ({ name, abbreviation, color, secondaryColor });
const result = (
  name: string,
  abbreviation: string,
  color: string,
  goalDifference: number,
  points: number,
): StandingsRow => ({
  name,
  abbreviation,
  color,
  played: 8,
  goalDifference,
  points,
});

export const leagues: League[] = [
  {
    id: "premier-league",
    country: "ENGLAND",
    division: "TOP FLIGHT",
    name: "Premier League",
    markClass: "mark-lime",
    matches: [
      {
        id: "liv-ars",
        home: team("Liverpool", "LIV", "#c52638"),
        away: team("Arsenal", "ARS", "#df233b"),
        homeScore: 2,
        awayScore: 1,
        status: "live",
        minute: "67",
        kickoff: "14:30",
        tv: "Sky Sports",
        events: [
          {
            minute: "42'",
            player: "Mohamed Salah",
            type: "goal",
            team: "home",
          },
          {
            minute: "58'",
            player: "Bukayo Saka",
            type: "yellow",
            team: "away",
          },
          { minute: "61'", player: "Luis Diaz", type: "goal", team: "home" },
        ],
      },
      {
        id: "mci-che",
        home: team("Man City", "MCI", "#74aee7", "#172c5b"),
        away: team("Chelsea", "CHE", "#1756bd"),
        homeScore: 1,
        awayScore: 1,
        status: "half-time",
        minute: "HT",
        kickoff: "16:30",
        tv: "TNT Sports",
        events: [
          {
            minute: "23'",
            player: "Erling Haaland",
            type: "goal",
            team: "home",
          },
          { minute: "41'", player: "Cole Palmer", type: "goal", team: "away" },
        ],
      },
      {
        id: "new-tot",
        home: team("Newcastle", "NEW", "#171717"),
        away: team("Tottenham", "TOT", "#253469"),
        status: "upcoming",
        kickoff: "17:30",
        tv: "Sky Sports",
        events: [],
      },
      {
        id: "avl-whu",
        home: team("Aston Villa", "AVL", "#813a78"),
        away: team("West Ham", "WHU", "#831f3e"),
        homeScore: 0,
        awayScore: 0,
        status: "finished",
        minute: "FT",
        kickoff: "12:00",
        events: [
          {
            minute: "76'",
            player: "Ollie Watkins",
            type: "yellow",
            team: "home",
          },
        ],
      },
    ],
    standings: [
      result("Liverpool", "LIV", "#c52638", 14, 21),
      result("Arsenal", "ARS", "#df233b", 11, 19),
      result("Man City", "MCI", "#74aee7", 10, 18),
      result("Aston Villa", "AVL", "#813a78", 8, 16),
      result("Chelsea", "CHE", "#1756bd", 5, 15),
    ],
  },
  {
    id: "la-liga",
    country: "SPAIN",
    division: "TOP FLIGHT",
    name: "LaLiga",
    markClass: "mark-coral",
    matches: [
      {
        id: "bar-val",
        home: team("Barcelona", "FCB", "#a2226f", "#e5bd4d"),
        away: team("Valencia", "VAL", "#c63038", "#e9b841"),
        homeScore: 3,
        awayScore: 0,
        status: "live",
        minute: "52",
        kickoff: "15:15",
        tv: "ESPN",
        events: [
          { minute: "19'", player: "Lamine Yamal", type: "goal", team: "home" },
          { minute: "38'", player: "Raphinha", type: "goal", team: "home" },
        ],
      },
      {
        id: "atm-gir",
        home: team("Atletico Madrid", "ATM", "#cb1f38"),
        away: team("Girona", "GIR", "#cf2935"),
        homeScore: 1,
        awayScore: 0,
        status: "finished",
        minute: "FT",
        kickoff: "13:00",
        events: [
          {
            minute: "32'",
            player: "Antoine Griezmann",
            type: "goal",
            team: "home",
          },
        ],
      },
      {
        id: "rma-soc",
        home: team("Real Madrid", "RMA", "#d7bf57", "#30264e"),
        away: team("Real Sociedad", "RSO", "#3357a0"),
        status: "upcoming",
        kickoff: "20:00",
        tv: "ESPN",
        events: [],
      },
    ],
    standings: [
      result("Barcelona", "FCB", "#a2226f", 16, 22),
      result("Real Madrid", "RMA", "#d7bf57", 12, 20),
      result("Atletico Madrid", "ATM", "#cb1f38", 9, 17),
      result("Girona", "GIR", "#cf2935", 7, 16),
      result("Real Sociedad", "RSO", "#3357a0", 4, 13),
    ],
  },
  {
    id: "champions-league",
    country: "EUROPE",
    division: "GROUP STAGE",
    name: "Champions League",
    markClass: "mark-blue",
    matches: [
      {
        id: "psg-bay",
        home: team("Paris SG", "PSG", "#283b79"),
        away: team("Bayern", "FCB", "#d52937"),
        homeScore: 1,
        awayScore: 2,
        status: "live",
        minute: "78",
        kickoff: "18:00",
        tv: "TNT Sports",
        events: [
          { minute: "14'", player: "Harry Kane", type: "goal", team: "away" },
          {
            minute: "54'",
            player: "Ousmane Dembele",
            type: "goal",
            team: "home",
          },
          {
            minute: "71'",
            player: "Jamal Musiala",
            type: "goal",
            team: "away",
          },
        ],
      },
      {
        id: "inter-ben",
        home: team("Inter", "INT", "#1763a5"),
        away: team("Benfica", "SLB", "#dc2638"),
        homeScore: 2,
        awayScore: 2,
        status: "finished",
        minute: "FT",
        kickoff: "18:00",
        events: [
          {
            minute: "27'",
            player: "Lautaro Martinez",
            type: "goal",
            team: "home",
          },
          {
            minute: "83'",
            player: "Angel Di Maria",
            type: "yellow",
            team: "away",
          },
        ],
      },
      {
        id: "dor-juv",
        home: team("Dortmund", "BVB", "#f5d927", "#202020"),
        away: team("Juventus", "JUV", "#252525"),
        status: "upcoming",
        kickoff: "20:00",
        tv: "TNT Sports",
        events: [],
      },
    ],
    standings: [
      result("Bayern", "FCB", "#d52937", 6, 9),
      result("Paris SG", "PSG", "#283b79", 4, 7),
      result("Dortmund", "BVB", "#d7c323", 1, 4),
      result("Inter", "INT", "#1763a5", -2, 3),
      result("Juventus", "JUV", "#252525", -3, 1),
    ],
  },
  {
    id: "serie-a",
    country: "ITALY",
    division: "TOP FLIGHT",
    name: "Serie A",
    markClass: "mark-blue",
    matches: [
      {
        id: "mil-nap",
        home: team("AC Milan", "MIL", "#dc293a"),
        away: team("Napoli", "NAP", "#2879bb"),
        homeScore: 0,
        awayScore: 1,
        status: "finished",
        minute: "FT",
        kickoff: "14:00",
        events: [
          {
            minute: "49'",
            player: "Khvicha Kvaratskhelia",
            type: "goal",
            team: "away",
          },
        ],
      },
      {
        id: "rom-laz",
        home: team("Roma", "ROM", "#a52836"),
        away: team("Lazio", "LAZ", "#7ba8d0"),
        status: "upcoming",
        kickoff: "19:45",
        tv: "DAZN",
        events: [],
      },
    ],
    standings: [
      result("Napoli", "NAP", "#2879bb", 12, 20),
      result("AC Milan", "MIL", "#dc293a", 9, 18),
      result("Inter", "INT", "#1763a5", 8, 17),
      result("Roma", "ROM", "#a52836", 5, 15),
      result("Lazio", "LAZ", "#7ba8d0", 2, 13),
    ],
  },
];

export const articles: Article[] = [
  {
    id: "title-race",
    title: "The title race just found another gear",
    summary:
      "A huge afternoon at Anfield gives the Premier League table a whole new look.",
    category: "Premier League",
    source: "THE ATHLETIC",
    timeAgo: "8 min ago",
    image:
      "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=85",
  },
  {
    id: "young-stars",
    title: "The young stars making Europe look twice",
    summary:
      "From Barcelona to Paris, a new generation is changing the rhythm of the Champions League.",
    category: "Champions League",
    source: "ESPN",
    timeAgo: "34 min ago",
    image:
      "https://images.unsplash.com/photo-1508098682722-e99c643e7f0b?auto=format&fit=crop&w=950&q=85",
  },
  {
    id: "touchline-talk",
    title: "What a derby tells us about the season ahead",
    summary:
      "Tactics, trust and the moments that can turn a rivalry into a statement.",
    category: "Analysis",
    source: "BBC SPORT",
    timeAgo: "1 hr ago",
    image:
      "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=950&q=85",
  },
  {
    id: "weekend-watch",
    title: "Three fixtures we would not miss this weekend",
    summary:
      "A classic European rivalry and a Premier League six-pointer top our viewing list.",
    category: "The Weekend",
    source: "SKY SPORTS",
    timeAgo: "2 hr ago",
    image:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=950&q=85",
  },
];
