// Copyright (C) RefractJS Team - All Rights Reserved
// Unauthorized copying of this file, via any medium is strictly prohibited
// Proprietary and confidential
// Written by the RefractJS Team

process.on('message', (message) => {
    switch (message.command) {
        case "init_sequence":
            process.send({ command: 'init_complete' });
            break;
        default:
            process.send({ command: 'parser_failure' });
    }
});