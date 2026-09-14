/* ============================================================
   riddles.js — local riddle pool (zero-cost, offline)
   ============================================================ */
(function (global) {
    "use strict";

    const RIDDLES = [
        { question: "What has keys but can't open locks?", answer: "A piano", choices: ["A piano", "A map", "A computer", "A door"] },
        { question: "What has a head and a tail but no body?", answer: "A coin", choices: ["A coin", "A snake", "A comet", "A worm"] },
        { question: "What gets wetter the more it dries?", answer: "A towel", choices: ["A towel", "A sponge", "A cloth", "A mop"] },
        { question: "What can you catch but not throw?", answer: "A cold", choices: ["A cold", "A ball", "A fish", "A frisbee"] },
        { question: "What has many teeth but can't bite?", answer: "A comb", choices: ["A comb", "A saw", "A zipper", "A gear"] },
        { question: "What has legs but cannot walk?", answer: "A table", choices: ["A table", "A chair", "A stool", "A bed"] },
        { question: "What has an eye but cannot see?", answer: "A needle", choices: ["A needle", "A storm", "A potato", "A camera"] },
        { question: "What goes up but never comes down?", answer: "Your age", choices: ["Your age", "A balloon", "Smoke", "A rocket"] },
        { question: "What has words but never speaks?", answer: "A book", choices: ["A book", "A dictionary", "A letter", "A sign"] },
        { question: "What has a neck but no head?", answer: "A bottle", choices: ["A bottle", "A shirt", "A guitar", "A vase"] },
        { question: "What can travel around the world while staying in a corner?", answer: "A stamp", choices: ["A stamp", "A coin", "A postcard", "A letter"] },
        { question: "What has a thumb and four fingers but is not alive?", answer: "A glove", choices: ["A glove", "A hand", "A mitten", "A puppet"] },
        { question: "What is full of holes but still holds water?", answer: "A sponge", choices: ["A sponge", "A net", "A colander", "A bucket"] },
        { question: "What can you break without touching it?", answer: "A promise", choices: ["A promise", "A heart", "A record", "A rule"] },
        { question: "What goes up and down but doesn't move?", answer: "A staircase", choices: ["A staircase", "An elevator", "A ladder", "A hill"] },
        { question: "What has a ring but no finger?", answer: "A phone", choices: ["A phone", "A bell", "A planet", "A circle"] },
        { question: "What has branches but no leaves?", answer: "A bank", choices: ["A bank", "A tree", "A river", "A family"] },
        { question: "What can fill a room but takes up no space?", answer: "Light", choices: ["Light", "Air", "Sound", "Shadow"] },
        { question: "What is always in front of you but can't be seen?", answer: "The future", choices: ["The future", "Your nose", "A mirror", "Time"] },
        { question: "What gets bigger the more you take away?", answer: "A hole", choices: ["A hole", "A pile", "A debt", "A gap"] },
        { question: "What has cities but no houses, mountains but no trees, water but no fish?", answer: "A map", choices: ["A map", "A globe", "A drawing", "A model"] },
        { question: "What has a bed but never sleeps?", answer: "A river", choices: ["A river", "A truck", "A garden", "A bedroom"] },
        { question: "What runs but never walks?", answer: "Water", choices: ["Water", "A clock", "A nose", "A motor"] },
        { question: "What has a face but no eyes?", answer: "A clock", choices: ["A clock", "A coin", "A die", "A card"] },
        { question: "What can be cracked, made, told, and played?", answer: "A joke", choices: ["A joke", "A code", "A game", "A nut"] },
        { question: "What has a heart that doesn't beat?", answer: "An artichoke", choices: ["An artichoke", "A stone", "A tree", "A machine"] },
        { question: "What is so fragile that saying its name breaks it?", answer: "Silence", choices: ["Silence", "Glass", "A promise", "Trust"] },
        { question: "What has many keys but can't open a single lock?", answer: "A piano", choices: ["A piano", "A keyboard", "A map", "A typewriter"] },
        { question: "What can you hold in your left hand but not your right?", answer: "Your right elbow", choices: ["Your right elbow", "A feather", "A pencil", "A coin"] },
        { question: "What has a bottom at the top?", answer: "Your legs", choices: ["Your legs", "A bottle", "A mountain", "A cup"] },
        { question: "What goes through towns and hills but never moves?", answer: "A road", choices: ["A road", "A river", "A train", "A path"] },
        { question: "What has four legs in the morning, two at noon, and three in the evening?", answer: "A human", choices: ["A human", "A dog", "A cat", "A bird"] },
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