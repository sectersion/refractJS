import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/api/data', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'data.json'));
});

app.post('/api/data', (req, res) => {
    const newEntry = {
        value: req.body.value,
        timestamp: new Date().toISOString()
    };
    const dataPath = join(__dirname, 'public', 'data.json');
    fs.readFile(dataPath, 'utf8', (err, fileData) => {
        let data = [];
        if (!err && fileData) {
            try {
                data = JSON.parse(fileData);
            } catch (e) {
                data = [];
            }
        }
        data.push(newEntry);
        fs.writeFile(dataPath, JSON.stringify(data, null, 2), err => {
            if (err) {
                res.status(500).json({ error: 'Failed to save data.' });
            } else {
                res.status(200).json({ success: true });
            }
        });
    });
});

app.get('/view', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'view.html'));
})

const PORT = process.env.PORT || 3131;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});