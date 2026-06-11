-- Seed the curated "I want to..." guided pathways. Idempotent: existing
-- slugs are left untouched so admin edits survive re-deploys.

INSERT INTO intents (slug, title, intro, icon, sort_order, config) VALUES
(
  'move-goods-by-rail',
  'Move goods by rail',
  'Find the right short line, interchange, and route to get your product moving by rail — from farm or facility to market.',
  'train',
  10,
  '{
    "destinationPath": "/route-finder",
    "searchTerms": ["transload", "grain terminal", "rail siding"],
    "defaultFilters": {"sector": "logistics"},
    "guidedQuestions": [
      "What are you shipping?",
      "Where is your product located?",
      "Where does it need to go?"
    ],
    "ctas": [
      {"label": "Find my route", "path": "/route-finder"},
      {"label": "Browse transloads", "path": "/directory?sector=logistics"}
    ],
    "aiPrompts": [
      "How do I start shipping by rail from my location?",
      "What does it cost to move grain by rail vs truck?",
      "Which short line is closest to me?"
    ]
  }'::jsonb
),
(
  'find-transload-site',
  'Find a transload site',
  'Locate transload and terminal facilities where trucks meet rail across the Prairie short line network.',
  'forklift',
  20,
  '{
    "destinationPath": "/directory?sector=logistics",
    "searchTerms": ["transload", "terminal", "storage"],
    "defaultFilters": {"sector": "logistics", "q": "transload"},
    "guidedQuestions": [
      "What commodity are you handling?",
      "Which region do you need coverage in?"
    ],
    "ctas": [
      {"label": "Browse transloads", "path": "/directory?sector=logistics"},
      {"label": "Show on map", "path": "/map?layers=transloads"}
    ],
    "aiPrompts": [
      "Show me transload sites near Saskatoon",
      "Which transloads handle fertilizer?"
    ]
  }'::jsonb
),
(
  'find-buyers-processors',
  'Find buyers or processors',
  'Connect with verified buyers, processors, and value-added facilities along rail-served corridors.',
  'handshake',
  30,
  '{
    "destinationPath": "/directory?sector=agrivalue",
    "searchTerms": ["processor", "buyer", "crush plant", "mill"],
    "defaultFilters": {"sector": "agrivalue"},
    "guidedQuestions": [
      "What product are you selling?",
      "How far can you ship?"
    ],
    "ctas": [
      {"label": "Browse the marketplace", "path": "/directory"},
      {"label": "Search by sector", "path": "/search"}
    ],
    "aiPrompts": [
      "Who buys oats near the Great Western corridor?",
      "Find processors within 100km of Regina"
    ]
  }'::jsonb
),
(
  'find-railcar-storage',
  'Find railcar storage',
  'Short line railways offer competitive railcar storage. Find available capacity across the network.',
  'warehouse',
  40,
  '{
    "destinationPath": "/directory?q=storage",
    "searchTerms": ["railcar storage", "car storage", "siding"],
    "defaultFilters": {"q": "railcar storage"},
    "guidedQuestions": [
      "How many cars do you need to store?",
      "For how long?"
    ],
    "ctas": [
      {"label": "Search storage", "path": "/search?q=railcar+storage"}
    ],
    "aiPrompts": [
      "Which short lines offer railcar storage?",
      "What does railcar storage typically cost?"
    ]
  }'::jsonb
),
(
  'build-near-rail',
  'Build near rail',
  'Explore rail-served development sites, zoning-ready land, and corridor communities looking for investment.',
  'factory',
  50,
  '{
    "destinationPath": "/map?layers=development-sites",
    "searchTerms": ["development site", "industrial land", "rail served"],
    "guidedQuestions": [
      "What kind of facility are you building?",
      "Which provinces are you considering?",
      "Do you need direct rail access or proximity?"
    ],
    "ctas": [
      {"label": "Explore development sites", "path": "/map?layers=development-sites"},
      {"label": "Talk to an economic developer", "path": "/contact?intent=build-near-rail"}
    ],
    "aiPrompts": [
      "Where can I build a rail-served facility in Saskatchewan?",
      "Which communities want value-added agriculture investment?"
    ]
  }'::jsonb
),
(
  'explore-trade-corridor',
  'Explore a trade corridor',
  'Tour the short line corridors of Western Canada — what moves on them, who operates them, and where they connect.',
  'map',
  60,
  '{
    "destinationPath": "/corridors",
    "searchTerms": ["corridor", "short line", "interchange"],
    "guidedQuestions": [
      "Which province or region interests you?",
      "Are you looking at a specific commodity?"
    ],
    "ctas": [
      {"label": "Browse corridors", "path": "/corridors"},
      {"label": "Open the atlas", "path": "/map?layers=shortlines,class1,interchanges"}
    ],
    "aiPrompts": [
      "Tell me about the short line corridors in Saskatchewan",
      "Which corridors connect to the Port of Vancouver?"
    ]
  }'::jsonb
),
(
  'promote-my-railway-or-site',
  'Promote my railway or site',
  'List your railway, facility, or development site on Prairie Connect and get in front of shippers and investors.',
  'megaphone',
  70,
  '{
    "destinationPath": "/directory/submit",
    "guidedQuestions": [
      "What are you promoting — a railway, a facility, or land?",
      "Is it rail-served today?"
    ],
    "ctas": [
      {"label": "Submit a listing", "path": "/directory/submit"},
      {"label": "Ask about featured placement", "path": "/contact?intent=promote-my-railway-or-site"}
    ],
    "aiPrompts": [
      "How do I get my facility listed on Prairie Connect?",
      "What does a featured placement include?"
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
