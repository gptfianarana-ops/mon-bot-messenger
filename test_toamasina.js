const { searchToamasina } = require('./toamasina_proxy.js');

async function test() {
    console.log("=== Début du test Toamasina pour 2708320 ===");
    const results = await searchToamasina("2708320");
    console.log("Résultats trouvés:", JSON.stringify(results, null, 2));
    console.log("=== Fin du test ===");
}

test();
