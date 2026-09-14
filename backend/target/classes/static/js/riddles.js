/* ============================================================
   riddles.js — local riddle pool (zero-cost, offline)
   Each riddle is a haiku (5-7-5 syllables) with hidden answer
   ============================================================ */
(function (global) {
    "use strict";

    const RIDDLES = [
        {
            question: "Black keys, white keys sing\nNo lock opens to their tune\nMusic flows within",
            answer: "A piano",
            choices: ["A piano", "A map", "A computer", "A door"]
        },
        {
            question: "Round head, tail behind\nNo body in the middle\nSpends but has no life",
            answer: "A coin",
            choices: ["A coin", "A snake", "A comet", "A worm"]
        },
        {
            question: "Wet more as it dries\nHangs upon the bathroom rack\nSoft thirst drinks the bath",
            answer: "A towel",
            choices: ["A towel", "A sponge", "A cloth", "A mop"]
        },
        {
            question: "Catch it, cannot throw\nWinter brings it uninvited\nRest cures the sneeze fast",
            answer: "A cold",
            choices: ["A cold", "A ball", "A fish", "A frisbee"]
        },
        {
            question: "Many teeth in row\nCannot bite a single thing\nStraightens tangled hair",
            answer: "A comb",
            choices: ["A comb", "A saw", "A zipper", "A gear"]
        },
        {
            question: "Four legs standing tall\nCannot walk a single step\nHolds your dinner plate",
            answer: "A table",
            choices: ["A table", "A chair", "A stool", "A bed"]
        },
        {
            question: "One eye sees no light\nThread passes through the small hole\nMends the torn apart",
            answer: "A needle",
            choices: ["A needle", "A storm", "A potato", "A camera"]
        },
        {
            question: "Numbers climb each year\nNever once goes back again\nBirthdays mark the rise",
            answer: "Your age",
            choices: ["Your age", "A balloon", "Smoke", "A rocket"]
        },
        {
            question: "Pages hold the words\nSilent stories wait inside\nOpen, read, travel",
            answer: "A book",
            choices: ["A book", "A dictionary", "A letter", "A sign"]
        },
        {
            question: "Long neck, no head found\nCork guards the liquid within\nPour and share the drink",
            answer: "A bottle",
            choices: ["A bottle", "A shirt", "A guitar", "A vase"]
        },
        {
            question: "Corner holds the world\nSticky back carries the mail\nTravels far and wide",
            answer: "A stamp",
            choices: ["A stamp", "A coin", "A postcard", "A letter"]
        },
        {
            question: "Thumb and fingers four\nNot alive but fits the hand\nWarms against the cold",
            answer: "A glove",
            choices: ["A glove", "A hand", "A mitten", "A puppet"]
        },
        {
            question: "Full of holes yet holds\nWater soaks in every pore\nSqueeze and it lets go",
            answer: "A sponge",
            choices: ["A sponge", "A net", "A colander", "A bucket"]
        },
        {
            question: "Break without a touch\nWords once spoken bind the heart\nTrust once lost is gone",
            answer: "A promise",
            choices: ["A promise", "A heart", "A record", "A rule"]
        },
        {
            question: "Goes up, goes down, stays\nSteps connect each floor to floor\nFeet move, stairs stand firm",
            answer: "A staircase",
            choices: ["A staircase", "An elevator", "A ladder", "A hill"]
        },
        {
            question: "Has a ring, no hand\nVoice travels through the wire\nHello, who is this?",
            answer: "A phone",
            choices: ["A phone", "A bell", "A planet", "A circle"]
        },
        {
            question: "Branches, no leaves grow\nMoney kept in vaulted rooms\nInterest blooms in time",
            answer: "A bank",
            choices: ["A bank", "A tree", "A river", "A family"]
        },
        {
            question: "Fills the room with light\nTakes no space, no weight at all\nDarkness flees away",
            answer: "Light",
            choices: ["Light", "Air", "Sound", "Shadow"]
        },
        {
            question: "Always just ahead\nNever caught by reaching hand\nTomorrow becomes today",
            answer: "The future",
            choices: ["The future", "Your nose", "A mirror", "Time"]
        },
        {
            question: "Dig and it grows wide\nEmpty space expands below\nMore dirt, bigger hole",
            answer: "A hole",
            choices: ["A hole", "A pile", "A debt", "A gap"]
        },
        {
            question: "Cities, no houses\nMountains, trees, and rivers drawn\nPaper holds the world",
            answer: "A map",
            choices: ["A map", "A globe", "A drawing", "A model"]
        },
        {
            question: "Has a bed, no sleep\nWater flows through stone and sand\nJourney to the sea",
            answer: "A river",
            choices: ["A river", "A truck", "A garden", "A bedroom"]
        },
        {
            question: "Runs but has no legs\nFlows downhill, never walks back\nLife drinks from its path",
            answer: "Water",
            choices: ["Water", "A clock", "A nose", "A motor"]
        },
        {
            question: "Face with hands that move\nNo eyes to see the passing\nTicks the seconds by",
            answer: "A clock",
            choices: ["A clock", "A coin", "A die", "A card"]
        },
        {
            question: "Cracked, made, told, played\nLaughter bursts from word and wit\nJoy in punchline form",
            answer: "A joke",
            choices: ["A joke", "A code", "A game", "A nut"]
        },
        {
            question: "Heart that does not beat\nGreen leaves guard the tender core\nSteam reveals the prize",
            answer: "An artichoke",
            choices: ["An artichoke", "A stone", "A tree", "A machine"]
        },
        {
            question: "Speak and it is gone\nQuiet holds the loudest power\nListen to the hush",
            answer: "Silence",
            choices: ["Silence", "Glass", "A promise", "Trust"]
        },
        {
            question: "Many keys, no locks\nIvory sings beneath the hands\nSongs without a door",
            answer: "A piano",
            choices: ["A piano", "A keyboard", "A map", "A typewriter"]
        },
        {
            question: "Left hand holds it tight\nRight hand cannot reach its bend\nElbow knows the trick",
            answer: "Your right elbow",
            choices: ["Your right elbow", "A feather", "A pencil", "A coin"]
        },
        {
            question: "Bottom at the top\nTwo legs carry you along\nFeet touch ground below",
            answer: "Your legs",
            choices: ["Your legs", "A bottle", "A mountain", "A cup"]
        },
        {
            question: "Through towns, over hills\nNever moves an inch itself\nCars and feet travel",
            answer: "A road",
            choices: ["A road", "A river", "A train", "A path"]
        },
        {
            question: "Morning four legs crawl\nNoon walks on two upright legs\nEvening adds a cane",
            answer: "A human",
            choices: ["A human", "A dog", "A cat", "A bird"]
        },
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