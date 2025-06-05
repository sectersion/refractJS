// Copyright (C) RefractJS Team - All Rights Reserved
// Unauthorized copying of this file, via any medium is strictly prohibited
// Proprietary and confidential
// Written by the RefractJS Team

const express = require('express');
const app = express();
const readline = require('node:readline');
const mysql = require('mysql2/promise');
const port = 3000;
const { exec } = require('child_process');
const { fork } = require('child_process');
const ping = require('ping');
const path = require('path');

//POST request support shit
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.json());
app.use(express.urlencoded());

//MySQL data
let sql_host = '127.0.0.1'; //force IPv4 to prevent IPv6 errors with MySQL connection
let sql_user = 'registry_user';
let sql_password = 'password';
let sql_database = 'registry';

//subprocess health
let health = {
    nodeupdater_daemon: {
        status: "000",
        update: function() {
            nodeupdater_daemon.send({ command: 'health_update' });
            setTimeout(() => {
                if (health.nodeupdater_daemon.status != 200) {
                    return false;
                } else {
                    return true;
                }
            }, 1000);
        }
    }
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let nodeupdater_daemon = null; //global node updater subprocess var (there's gotta be a better way to do this)

//START PROGRAM
main();

function main() {
    console.log("RefractJS Registry Server");
    console.log("This software is proprietary, confidential, and not meant to be used by anyone other than official RefractJS team members!");
    console.log();
    console.log("Choose a start up option:");
    console.log("1 - Start regularly (assumes everything is set up and configured properly)");
    console.log("2 - Full initialization (new setup)");
    //will allow for easy setup on other instances
    rl.question(`> `, async actionInput => {
        if (actionInput == "1") {
            await initSequence();
        } else if (actionInput == "2") {
            await fullSetup();
        } else {
            console.log("Incorrect input. Please restart the program.");
            process.exit();
        }
        rl.close();
    });
}

//REQUESTS SHOULD NOT BE MADE TO ROOT
app.get('/', (req, res) => {
    res.type('json');
    res.send({"res_type":"error", "lethal":"false", "code":"1", "message":"Incorrect API request to root URL. This is an internal server error that should be reported on the RefractJS GitHub."});
});

//ACCESS NODE REGISTRATION
app.post('/register_node/access_node', async (req, res) => {
    console.log(`A new access node is registering...`);
    try {
        let pingTime = await pingNode(req.body.ip);
        if (pingTime == false) {
            res.type('json');
            res.send({"temporary":"ping failure"});
            console.log(`${req.body.ip} failed registration. ERROR: ping failure`);
            return;
        } else {
            console.log(`${req.body.ip} was pinged at ${pingTime}ms.`);
        }
        const db_connection = await mysql.createConnection({
            host: sql_host,
            user: sql_user,
            password: sql_password,
            database: sql_database
        });
        console.log(`Adding ${req.body.ip} to the database...`);
        const [rows, fields] = await db_connection.execute(`INSERT INTO nodes VALUES ('access', '${req.body.ip}', '', '${pingTime}', '{"assigned_uploadNode":"NULL"}');`);
        db_connection.end();
        console.log(`${req.body.ip} has been added to the database successfully.`);
        res.type('json');
        res.send({"res_type":"success"});
    } catch (e) {
        console.error(`REGISTRATION FAILURE FOR ${req.body.ip}!`, e);
        res.type('json');
        res.send({"res_type":"error", "lethal":"false", "code":"2", "message":"Failure to register Access Node. Contact support if the issue persists."});
    }
});

//UPLOAD NODE REGISTRATION
app.post('/register_node/upload_node', (req, res) => {
    res.type('json');
    res.send({"temporary":"You have reached the point for registering an Upload Node. This API is not ready."});
});

function initSequence() {
    nodeupdater_daemon = fork(path.join(__dirname, './nodeupdater_daemon.js'));

    nodeupdater_daemon.on('message', (message) => {
        nodeupdater_daemon_messageHandler(message);
    });

    nodeupdater_daemon.on('disconnect', () => {
        console.log('nodeupdater_daemon: FATAL ERROR! The IPC channel has closed for this subprocess. The main thread will now be killed to prevent request corruption.');
        process.exit();
    });

    nodeupdater_daemon.send({ command: 'init_sequence' });
    console.log("The Node Updater Daemon has been called to start. Beware of subprocess failures as they might not be caught by the main process and keep an eye out for the startup success message.");
    setInterval(checkAllSubprocessHealth, 30000);
    console.log("Subprocess health checking has been enabled.");
    console.log("");
    app.listen(port, async () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
    console.log("This option assumes that the MySQL database has been configured properly and is running! This server is OPEN FOR REQUESTS.");
}

async function fullSetup() {
    try {
        console.log(`Setup assumes that a MySQL DB called "${sql_database}" at "${sql_host}" exists.`);
        const db_connection = await mysql.createConnection({
            host: sql_host,
            user: sql_user,
            password: sql_password,
            database: sql_database
        });

        console.log("Creating NODEs table...");
        //try to create the IPs table
        const [rows, fields] = await db_connection.execute(`CREATE TABLE nodes (node_type TEXT, ip TEXT, history TEXT, ping TEXT, misc TEXT);`);
        db_connection.end();
        console.log("Table created successfully.");

        nodeupdater_daemon = fork(path.join(__dirname, './nodeupdater_daemon.js'));

        nodeupdater_daemon.on('message', (message) => {
            nodeupdater_daemon_messageHandler(message);
        });

        nodeupdater_daemon.on('disconnect', () => {
            console.log('nodeupdater_daemon: FATAL ERROR! The IPC channel has closed for this subprocess. The main thread will now be killed to prevent request corruption.');
            process.exit();
        });

        nodeupdater_daemon.send({ command: 'init_sequence' });
        console.log("The Node Updater Daemon has been called to start. Beware of subprocess failures as they might not be caught by the main process and keep an eye out for the startup success message.");
        setInterval(checkAllSubprocessHealth, 30000);
        console.log("Subprocess health checking has been enabled.");
        console.log("");

        app.listen(port, async () => {
            console.log(`Server listening at http://localhost:${port}`);
        });
        console.log("The Registry Server has been setup successfully. This server is OPEN FOR REQUESTS.");
    } catch (error) {
        console.error('FATAL ERROR while initializing! The program will now exit.', error);
        process.exit();
    }
}

async function pingNode(ip) {
    const pingRes = await ping.promise.probe(ip);
    if (pingRes.alive) {
        return pingRes.time;
    } else {
        return false;
    }
}

function nodeupdater_daemon_messageHandler(message) {
    switch (message.command) {
        case "init_complete":
            console.log(`The Node Updater Daemon has been started successfully. Any messages that start with "nodeupdater_daemon:" are messages from this subprocess.`);
            break;
        case "parser_failure":
            console.log(`nodeupdater_daemon: ERROR! The subprocess' command handler could not parse the message sent by the main process! Command: ${message.failedCommand}`)
            break;
        case "health_report":
            health.nodeupdater_daemon.status = message.status;
            break;
        case "node_killed_notice":
            console.log(`nodeupdater_daemon: ERROR! The node "${message.ip}" has been killed after failing a health check twice. Access Nodes will be reassigned new Upload Nodes if the killed node was an Upload Node.`);
            break;
        case "report_error":
            console.log(`nodeupdater_daemon: ERROR! A generic error occurred with the following message: ${message.message}`);
            break;
        default:
            console.log(`nodeupdater_daemon: ERROR! The handler could not parse the command "${message.command}".`);
    }
}

async function checkAllSubprocessHealth() {
    if (await health.nodeupdater_daemon.update() == false) {
        console.log(`nodeupdater_daemon: ERROR! This subprocess currently has the error code ${health.nodeupdater_daemon.status}. Subprocess error codes indicate serious problems.`);
    } else {
        console.log(`nodeupdater_daemon: Status 200 (alive)`);
    }
}