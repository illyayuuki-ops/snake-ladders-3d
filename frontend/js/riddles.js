/* ============================================================
   riddles.js — local riddle pool (zero-cost, offline)
   Each riddle is a haiku (5-7-5 syllables) with a short answer.
   The three haiku lines are joined with "\n" so the modal can
   render them stacked. This pool is the offline fallback for
   both local play and failed Gemini API calls.
   ============================================================ */
(function (global) {
    "use strict";

    const RIDDLES = [
        {
            question: "Shiny head on ground\nToss me up and watch me spin\nTail is what you find",
            answer: "coin",
            choices: ["coin", "button", "ring", "stamp"]
        },
        {
            question: "Dark within the room\nWax grows thin and wick burns bright\nShadow dances on",
            answer: "candle",
            choices: ["candle", "torch", "lantern", "match"]
        },
        {
            question: "Face with hands that move\nTicks away each passing hour\nNo eye can see it",
            answer: "clock",
            choices: ["clock", "watch", "calendar", "compass"]
        },
        {
            question: "Shout into the cave\nMy cry returns from far away\nSilent once again",
            answer: "echo",
            choices: ["echo", "sound", "voice", "shadow"]
        },
        {
            question: "Sunlight on the wall\nStretch and shrink as dusk arrives\nNo shape of its own",
            answer: "shadow",
            choices: ["shadow", "reflection", "silhouette", "ghost"]
        },
        {
            question: "Heavy iron claw\nLets the drifting ship be still\nHolds the boat in place",
            answer: "anchor",
            choices: ["anchor", "hook", "chain", "weight"]
        },
        {
            question: "Needle seeks the north\nSpinning till it points the way\nTraveler's true friend",
            answer: "compass",
            choices: ["compass", "gyroscope", "map", "magnet"]
        },
        {
            question: "Bridge of colored light\nArc of sun and rain at once\nFades when light departs",
            answer: "rainbow",
            choices: ["rainbow", "kite", "prism", "arc"]
        },
        {
            question: "Surface still and clear\nShows the face that looks right back\nTruth in quiet glass",
            answer: "mirror",
            choices: ["mirror", "pond", "glass", "window"]
        },
        {
            question: "Tower on the rocks\nBeacon sweeps the darkened sea\nShips find safe harbor",
            answer: "lighthouse",
            choices: ["lighthouse", "beacon", "tower", "lamp"]
        },
        {
            question: "Steam begins to rise\nBoiling water waits inside\nTea pours from the spout",
            answer: "teapot",
            choices: ["teapot", "kettle", "jar", "flask"]
        },
        {
            question: "Spanning wide and far\nCarries feet across the stream\nArches hold the road",
            answer: "bridge",
            choices: ["bridge", "road", "tunnel", "path"]
        },
        {
            question: "Tube peers at the night\nFinds bright dots among dark space\nSecrets in the sky",
            answer: "telescope",
            choices: ["telescope", "binoculars", "microscope", "camera"]
        },
        {
            question: "Flame dances, hungry\nOrange tongues lick upward fast\nWarmth from wood and spark",
            answer: "fire",
            choices: ["fire", "flame", "torch", "lamp"]
        },
        {
            question: "Storm clouds churn above\nCrack of war within the clouds\nSky drums its loud beat",
            answer: "thunder",
            choices: ["thunder", "lightning", "drum", "boom"]
        },
        {
            question: "Metal teeth in door\nTurn me and the lock will yield\nFreedom waits beyond",
            answer: "key",
            choices: ["key", "lock", "button", "lever"]
        },
        {
            question: "Drift down from the sky\nOne of many, soft and white\nMelt on tongue at once",
            answer: "snowflake",
            choices: ["snowflake", "star", "flake", "crystal"]
        },
        {
            question: "Twigs weave bowl of care\nHidden in the crook of branches\nEggs warm till they hatch",
            answer: "nest",
            choices: ["nest", "crib", "web", "hollow"]
        },
        {
            question: "Mountain holds a flame\nPressure builds beneath the crust\nEarth erupts in fire",
            answer: "volcano",
            choices: ["volcano", "mountain", "furnace", "fissure"]
        },
        {
            question: "Round a star it spins\nSpins through the void, cold and dark\nRocks and rings may form",
            answer: "planet",
            choices: ["planet", "star", "moon", "comet"]
        }
    ];

    function pickRandom() {
        const idx = Math.floor(Math.random() * RIDDLES.length);
        const r = RIDDLES[idx];
        const choices = r.choices || [r.answer, "Option B", "Option C", "Option D"];
        const shuffled = [...choices].sort(() => Math.random() - 0.5);
        return { question: r.question, answer: r.answer, choices: shuffled };
    }

    global.Riddles = { pickRandom };
})(window);
