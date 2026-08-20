const { handleOrientationMessage } = require('./orientation_module');

const testCases = [
    { text: 'ORIENTATION', state: {} },
    { text: 'L', state: { step: 'WAITING_SERIE' } },
    { text: '1', state: { step: 'MENU_EXPERT', currentSerie: 'A2' } },
    { text: 'agronomie', state: { step: 'MENU_EXPERT', currentSerie: 'A2' } },
    { text: 'S', state: { step: 'WAITING_SERIE' } },
    { text: 'informatique', state: { step: 'MENU_EXPERT', currentSerie: 'D' } }
];

testCases.forEach(c => {
    console.log(`--- Test: "${c.text}" (Mode: ${c.state.step || 'START'}) ---`);
    const res = handleOrientationMessage(c.text, c.state);
    console.log(`Reply: ${res.reply.substring(0, 100)}...`);
    console.log(`QuickReplies: ${res.quickReplies.join(', ')}`);
    console.log(`New State: ${JSON.stringify(c.state)}\n`);
});
