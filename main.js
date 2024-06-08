import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import psList from 'ps-list';
import Store from 'electron-store';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store();

function clearStoreData() {
    store.clear();
    console.log('Electron store data cleared');
}

clearStoreData();

let mainWindow = null;
let moonlightProcess;
let moonlightCheckInterval;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false
        },
        modal: true,
        parent: null,
        autoHideMenuBar: true,
    });

    mainWindow.loadURL(`file://${__dirname}/login.html`);

    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', async () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

async function isMoonlightRunning() {
    const processes = await psList();
    return processes.some(process => process.name === 'Moonlight.exe');
}

async function checkMoonlightStatus() {
    let moonlightStarted = false;

    while (true) {
        const running = await isMoonlightRunning();
        console.log('Moonlight running:', running);

        if (running && !moonlightStarted) {
            moonlightStarted = true;
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.hide();
                }
            }, 5000); // Wait for 5 seconds before hiding the main window
        }

        if (!running && moonlightStarted) {
            if (mainWindow) {
                mainWindow.show();
            } else {
                createWindow();
            }
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}


async function getSessionId(username) {
    let sessionId;
    let response;
    let errorStatusCode = 0;
    let sessionIdStatusCode = 0;

    while (true) {
        const accessToken = store.get('accessToken');
        try {
            response = await axios.post('http://10.11.1.181:3000/v1/games/play', {
                game_id: 1174180,
                username: username
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            sessionId = response.data.session_id;
            sessionIdStatusCode = response.status;

            store.set('sessionId', sessionId);
            store.set('sessionIdStatusCode', sessionIdStatusCode);

            console.log('Graphics card:', response.data.gpu_name);
            break;
        } catch (error) {
            console.error(error.response.data.message);
            errorStatusCode = error.response.status;
            console.error("in getSessionId,", errorStatusCode);
            store.set('sessionIdStatusCode', errorStatusCode);
            await new Promise(resolve => setTimeout(resolve, 5000));
        };
    };
    return sessionId;
}

async function getNetworkId(sessionId) {
    let networkId = '';
    let response;

    while (networkId === '') {
        try {
            const accessToken = store.get('accessToken');
            response = await axios.get(`http://10.11.1.181:3000/v1/session/${sessionId}/status`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            networkId = response.data.network_id;

            store.set('networkId', networkId);

            if (networkId === '') {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.error('Error fetching network ID!', error);
        }
    }
    return networkId;
}

ipcMain.on('open-moonlight', async () => {
    console.log("success open-moonlight!");
    try {
        console.log("now I'm going to try!");
        const username = store.get('username');
        const accessToken = store.get('accessToken');

        let sessionId;
        sessionId = await getSessionId(username);
        console.log("session id is :", sessionId);

        let networkId;
        networkId = await getNetworkId(sessionId);
        console.log("network id is :", networkId);

        if (sessionId && networkId) {
            mainWindow.webContents.send('network-id', networkId);

            const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientStart.ps1');
            const args = [
                '-network_id', networkId,
                '-session_id', sessionId,
                '-token', accessToken
            ];

            const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
                stdio: 'ignore',
                windowsHide: true
            });

            console.log("should be running the terminal now...");

            checkMoonlightStatus();
        } else {
            console.log("Cannot continue process :(");
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

ipcMain.on('quit-app', async () => {
    const networkId = store.get('networkId');

    const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientEnd.ps1');
    const args = ['-network_id', networkId];

    const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
        stdio: 'ignore',
        windowsHide: true
    });

    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId');
    store.delete('username');

    app.quit();
});

ipcMain.on('login-attempt', async (event, { email, password }) => {
    try {
        const response = await axios.post('http://10.11.1.181:3000/v1/account/login', {
            email,
            password,
        });

        if (response.status === 200) {
            const { username, token: { access_token: accessToken, refresh_token: refreshToken } } = response.data;

            store.set('username', username);
            store.set('accessToken', accessToken);
            store.set('refreshToken', refreshToken);

            event.reply('login-response', { success: true });
        }
    } catch (error) {
        console.error('Error during login:', error);
        if (error.response) {
            const { status } = error.response;
            if (status === 401) {
                event.reply('login-response', { success: false, errorMessage: 'Invalid credentials. Please try again.' });
            } else if (status === 500) {
                event.reply('login-response', { success: false, errorMessage: 'An unexpected error occurred. Please try again later.' });
            } else {
                event.reply('login-response', { success: false, errorMessage: 'An unknown error occurred. Please try again later.' });
            }
        } else {
            event.reply('login-response', { success: false, errorMessage: 'An unexpected error occurred. Please try again later.' });
        }
    }
});

ipcMain.on('refresh-access-token', async (event) => {
    const refreshToken = store.get('refreshToken');
    const accessToken = store.get('accessToken');
    try {
        const response = await axios.post('http://10.11.1.181:3000/v1/auth/token/refresh', {
            access_token: accessToken,
            refresh_token: refreshToken
        });

        const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data;

        store.set('accessToken', newAccessToken);
        store.set('refreshToken', newRefreshToken);
        console.log('Access Token has been refreshed.')
    } catch (error) {
        console.error('Error refreshing access token,', error.response.data.message);
        // Handle refresh token error
    }
});

ipcMain.on('cancel-loading', async () => {
    const accessToken = store.get('accessToken');
    const sessionId = store.get('sessionId');
    const networkId = store.get('networkId');

    try {
        if (sessionId) {
            const response = await axios.delete(`http://10.11.1.181:3000/v1/session/${sessionId}/terminate`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (response.status === 200) {
                console.log('Session terminated successfully');
                // store.delete('sessionId');
            } else {
                console.warn('Failed to terminate session:', response.status, response.statusText);
            }
        } else {
            console.warn('Session ID not found.');
        }
    } catch (error) {
        console.error('Error terminating session:', error);
    }

    try {
        if (networkId) {
            const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientEnd.ps1');
            const args = [
                '-network_id', networkId
            ];
            // Spawn the PowerShell process
            const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
                stdio: 'ignore',
                windowsHide: true
            });
        } else {
            console.warn('Network ID not found');
        };
    } catch (error) {
        console.error('Error deleting network:', error);
    }

    store.delete('sessionId');
    store.delete('networkId');

    // Redirect to mainpage.html
    mainWindow.loadURL(`file://${__dirname}/mainpage.html`);
});

ipcMain.on('cancel-loading-queue', async () => {
    mainWindow.loadURL(`file://${__dirname}/mainpage.html`);
});

ipcMain.on('get-network-id', (event) => {
    const networkId = store.get('networkId');
    if (networkId !== null && networkId !== undefined) {
        console.log('Network ID:', networkId);
        event.reply('network-id', networkId);
    } else {
        console.log('Network ID is not available yet.');
    }
});

ipcMain.on('get-session-id', (event) => {
    const sessionId = store.get('sessionId');
    if (sessionId !== null && sessionId !== undefined) {
        console.log('Session ID:', sessionId);
        event.reply('session-id', sessionId);
    } else {
        console.log('Session ID is not available yet.');
    }
});

ipcMain.handle('get-username', (event) => {
    const username = store.get('username');
    return username;
});

ipcMain.on('logout', async () => {
    // Delete tokens from store
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId'); // If you also want to clear the session ID from the store
    store.delete('username');

    // Load the login page
    mainWindow.loadURL(`file://${path.join(__dirname, 'login.html')}`);
});

ipcMain.handle('get-session-id-status-code', (event) => {
    const sesIdStatCode = store.get('sessionIdStatusCode');
    console.log("Stat code is:", sesIdStatCode);
    return sesIdStatCode;
});
