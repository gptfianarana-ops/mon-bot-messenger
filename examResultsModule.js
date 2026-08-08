const express = require('express');
const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');

// 1. CONFIGURATION DU MODULE
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || 'TON_PAGE_ACCESS_TOKEN';
const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 caractères
const IV_LENGTH = 16;
const ADMIN_PSIDS = process.env.ADMIN_PSIDS ? process.env.ADMIN_PSIDS.split(',') : ['TON_PSID_ADMIN'];
const DATA_FILE = './results_encrypted.db';

// Regions et Provinces autorisées
const ALLOWED_LOCATIONS = {
    "ANTANANARIVO": ["ANALAMANGA", "ITASY", "VAKINANKARATRA", "BONGOLAVA"],
    "TOAMASINA": ["ANALANJIROFO", "ATSINANANA", "ALAOTRA-MANGORO"],
    "FIANARANTSOA": ["HAUTE MATSIATRA", "IHOROMBE", "VATOVAVY", "FITOVINANY", "AMORON'I MANIA"],
    "MAHAJANGA": ["BOENY", "BETSIBOKA", "MELAKY", "SOFIA"],
    "TOLIARA": ["ATSIMO-ANDREFANA", "ANDROY", "ANOSY", "MENABE"],
    "ANTSIRANANA": ["DIANA", "SAVA"]
};

// 2. FONCTIONS DE CHIFFREMENT
function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function saveResults(province, region, examType, studentsList) {
    let currentData = {};
    if (fs.existsSync(DATA_FILE)) {
        try {
            const rawEncrypted = fs.readFileSync(DATA_FILE, 'utf8');
            currentData = JSON.parse(decrypt(rawEncrypted));
        } catch (e) { currentData = {}; }
    }

    const key = `${examType}_${province}_${region}`.toUpperCase();
    if (!currentData[key]) currentData[key] = [];

    studentsList.forEach(student => {
        if (!currentData[key].some(s => s.matricule === student.matricule)) {
            currentData[key].push(student);
        }
    });

    const encryptedContent = encrypt(JSON.stringify(currentData));
    fs.writeFileSync(DATA_FILE, encryptedContent, 'utf8');
}

function searchCandidate(examType, province, queryMatricule) {
    if (!fs.existsSync(DATA_FILE)) return null;
    try {
        const rawEncrypted = fs.readFileSync(DATA_FILE, 'utf8');
        const db = JSON.parse(decrypt(rawEncrypted));
        for (let key in db) {
            if (key.startsWith(`${examType}_${province}`.toUpperCase())) {
                const match = db[key].find(st => st.matricule === queryMatricule.trim());
                if (match) return match;
            }
        }
    } catch (e) { return null; }
    return null;
}

function sendTextMessage(senderPsid, text) {
    request({
        "url": "https://graph.facebook.com/v18.0/me/messages",
        "qs": { "access_token": PAGE_ACCESS_TOKEN },
        "method": "POST",
        "json": { "recipient": { "id": senderPsid }, "message": { "text": text } }
    });
}

// 3. FONCTION PRINCIPALE À TRAITER DANS VOTRE CODE
function processExamRequests(senderPsid, message) {
    const isAdmin = ADMIN_PSIDS.includes(senderPsid);

    // A. Si un admin envoie une image/un PDF pour extraction OCR
    if (isAdmin && message.attachments && message.attachments[0]) {
        const attachment = message.attachments[0];
        if (attachment.type === 'image' || attachment.type === 'file') {
            const fileUrl = attachment.payload.url;
            sendTextMessage(senderPsid, "🔍 Analyse approfondie du document en cours...");

            exec(`python3 ocr_engine.py "${fileUrl}"`, (error, stdout) => {
                if (error) {
                    sendTextMessage(senderPsid, "⚠️ Erreur serveur lors du traitement OCR.");
                    return;
                }
                try {
                    const response = JSON.parse(stdout);
                    if (response.status === "REJECTED") {
                        sendTextMessage(senderPsid, `⛔ Document rejeté : ${response.reason}`);
                    } else if (response.status === "SUCCESS") {
                        // Enregistrement sécurisé
                        saveResults("ANTANANARIVO", "ITASY", "BACC", response.data);
                        sendTextMessage(senderPsid, `✅ [Admin] ${response.count} candidat(s) Admis importé(s) (Region ITASY).`);
                    } else {
                        sendTextMessage(senderPsid, "ℹ️ Aucun candidat admis identifié.");
                    }
                } catch (e) {
                    sendTextMessage(senderPsid, "⚠️ Réponse OCR invalide.");
                }
            });
            return true; // Événement géré par ce module
        }
    }

    // B. Recherche par l'utilisateur (Exemple : BACC ANTANANARIVO 123456)
    if (message.text) {
        const text = message.text.trim();
        const args = text.split(' ');

        if (args[0].toUpperCase() === 'BACC' && args.length >= 3) {
            const province = args[1].toUpperCase();
            const matricule = args[2];

            if (!ALLOWED_LOCATIONS[province]) {
                sendTextMessage(senderPsid, `Province invalide. Choisissez parmi : ${Object.keys(ALLOWED_LOCATIONS).join(', ')}`);
                return true;
            }

            const candidate = searchCandidate('BACC', province, matricule);

            if (candidate) {
                const responseText = `🎓 RÉSULTAT BACC\n\n` +
                                     `• N° Matricule : ${candidate.matricule}\n` +
                                     `• Nom et Prénoms : ${candidate.nom_prenoms}\n` +
                                     `• Statut : ADMIS\n` +
                                     `• Mention : ${candidate.mention}`;
                sendTextMessage(senderPsid, responseText);
            } else {
                sendTextMessage(senderPsid, "Introuvable. Veuillez vérifier directement sur la liste officielle d'affichage au centre d'examen pour éviter toute erreur.");
            }
            return true; // Événement géré par ce module
        }
    }

    return false; // Passer la main aux autres fonctionnalités existantes du bot
}

module.exports = { processExamRequests };
