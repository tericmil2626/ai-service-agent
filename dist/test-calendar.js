"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./database");
async function checkCalendar() {
    const db = await (0, database_1.getDb)();
    const row = await db.get('SELECT * FROM business_integrations WHERE business_id = ?', 'default');
    console.log('Integration found:', !!row);
    if (row) {
        console.log('Provider:', row.provider);
        const config = JSON.parse(row.config);
        console.log('Has access token:', !!config.accessToken);
        console.log('Has refresh token:', !!config.refreshToken);
        console.log('Token expiry:', new Date(config.expiryDate));
    }
    else {
        console.log('No integration found for business_id: default');
    }
}
checkCalendar();
//# sourceMappingURL=test-calendar.js.map