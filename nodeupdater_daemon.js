// Copyright (C) RefractJS Team - All Rights Reserved
// Unauthorized copying of this file, via any medium is strictly prohibited
// Proprietary and confidential
// Written by the RefractJS Team

const ping = require('ping');
const mysql = require('mysql2/promise');

//MySQL data
let sql_host = '127.0.0.1'; //force IPv4 to prevent IPv6 errors with MySQL connection
let sql_user = 'registry_user';
let sql_password = 'password';
let sql_database = 'registry';

process.on('message', (message) => {
    switch (message.command) {
        case "init_sequence":
            setInterval(checkAllNodesHealth, 10000);
            process.send({ command: 'init_complete' });
            break;
        case "health_update":
            process.send({command: 'health_report', status: healthStatus()});
            break;
        default:
            process.send({ command: 'parser_failure', failedCommand: message.command });
    }
});

function healthStatus() {
    return 200;
}

async function updateNodeStatus(ip) {
    try {
        let pingTime = await pingNode(ip);
        if (pingTime == false) {
            const db_connection = await mysql.createConnection({host: sql_host, user: sql_user, password: sql_password, database: sql_database});
            const [rows, fields] = await db_connection.execute(`SELECT * FROM NODES WHERE ip = "${ip}";`);
            db_connection.end();
            if (rows[0].ping == "WARN") {
                const db_connection = await mysql.createConnection({host: sql_host, user: sql_user, password: sql_password, database: sql_database});
                const [rows, fields] = await db_connection.execute(`DELETE FROM nodes WHERE ip = '${ip}';`);
                db_connection.end();
                process.send({ command: 'node_killed_notice', ip: ip });
            } else {
                const db_connection = await mysql.createConnection({host: sql_host, user: sql_user, password: sql_password, database: sql_database});
                const [rows, fields] = await db_connection.execute(`UPDATE nodes SET ping = 'WARN' WHERE ip = '${ip}';`);
                db_connection.end();
                process.send({ command: 'report_error', message: `The node "${ip}" has failed a health check! The health check will be reattempted one more time next cycle.` });
            }
        } else {
            const db_connection = await mysql.createConnection({host: sql_host, user: sql_user, password: sql_password, database: sql_database});
            const [rows, fields] = await db_connection.execute(`UPDATE nodes SET ping = '${await pingNode(ip)}' WHERE ip = '${ip}';`);
            db_connection.end();
        }
    } catch (e) {
        process.send({ command: 'report_error', message: `A health check failed for a node. This is likely a MySQL error. STACK TRACE: ${e}` });
        return false;
    }
}

async function checkAllNodesHealth() {
    const db_connection = await mysql.createConnection({host: sql_host, user: sql_user, password: sql_password, database: sql_database});
    const [rows, fields] = await db_connection.execute(`SELECT * FROM NODES;`);
    db_connection.end();
    rows.forEach(row => {
        updateNodeStatus(row.ip);
    });
}

async function pingNode(ip) {
    const pingRes = await ping.promise.probe(ip);
    if (pingRes.alive) {
        return pingRes.time;
    } else {
        return false;
    }
}