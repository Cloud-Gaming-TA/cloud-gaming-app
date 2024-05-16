import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import psList from 'ps-list';
import Store from 'electron-store';
import axios from 'axios';
import { setDefaultAutoSelectFamily } from 'net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store();

let mainWindow = null;
let moonlightProcess = null;

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
    });

    // Then you can use __dirname in the same way as before
    mainWindow.loadURL(`file://${__dirname}/login.html`);

    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

// Function to check if moonlight.exe is running
async function isMoonlightRunning() {
    const processes = await psList();
    console.log("Checking if moonlight is running")
    return processes.some(process => process.name === 'Moonlight.exe');
}

async function checkMoonlightStatus() {
    while (true) {
        const running = await isMoonlightRunning();
        console.log(running)
        if (running) {
            mainWindow.webContents.send('moonlight-status', true);
            break; // Exit the loop once Moonlight is detected
        }
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds before rechecking
    }
}

async function getSessionId(username) {
    try {
        const accessToken = store.get('accessToken'); // Get the access token from the store
        const response = await axios.post('http://10.147.20.105:3000/v1/games/play', {
            game_id: 1174180,
            username: username
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}` // Include the access token in the Authorization header
            }
        });
        const sessionId = response.data.session_id; // Store the session ID
        store.set('sessionId', sessionId);
        console.log("returning session id");
        return sessionId;
    } catch (error) {
        console.error('Error fetching session ID:', error);
        throw error; // Handle the error appropriately in your application
    }
}

async function getNetworkId(sessionId, event) {
    let networkId = ''; // Declare networkId outside the loop
    let response;

    while (networkId === '') {
        try {
            const accessToken = store.get('accessToken');
            response = await axios.get(`http://10.147.20.105:3000/v1/session/${sessionId}/status`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            networkId = response.data.network_id; // Use the networkId variable declared outside

            store.set('network', networkId);
            console.log("response: ", response);

            if (networkId === '') {
                // Add a delay before retrying to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
            }
        } catch (error) {
            console.error('Error fetching network ID:', error);
            throw error; // Handle the error appropriately in your application
        }
    }

    // Once networkId is available, return it
    return networkId;
}


ipcMain.on('open-moonlight', async () => {
    console.log("success open-moonlight!");
    try {
        console.log("now I'm going to try!");
        const username = store.get('username');

        // Get the session ID
        let sessionId;
        try {
            sessionId = await getSessionId(username);
            console.log("session id is :", sessionId);
        } catch (error) {
            console.error('Error getting session ID:', error);
            // Handle the error appropriately
            return { sessionId: null, networkId: null };
        }

        let networkId;
        try {
            networkId = await getNetworkId(sessionId);
            console.log("network id is :", networkId);
        } catch (error) {
            console.error('Error getting network ID:', error);
            // Handle the error appropriately
            return { sessionId: sessionId, networkId: null };
        }

        console.log(sessionId);
        console.log(networkId);

        // Send the network ID to the renderer process
        mainWindow.webContents.send('network-id', networkId);

        const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientStart.ps1');
        const args = [
            '-network_id', networkId,
            '-session_id', sessionId
        ];

        // Spawn the PowerShell process
        const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
            stdio: 'inherit', // Show the terminal window
            windowsHide: false // Ensure the terminal window is not hidden
        });

        console.log("should be running the terminal now?")
        
        // Check if Moonlight is running mid-process
        const running = await isMoonlightRunning();
        mainWindow.webContents.send('moonlight-status', running);

        checkMoonlightStatus()

    } catch (error) {
        console.error('Error:', error);
    }
});

ipcMain.on('quit-app', async () => {
    const accessToken = store.get('accessToken');
    const sessionId = store.get('sessionId');

    try {
        if (sessionId) {
            const response = await axios.delete(`http://10.147.20.105:3000/v1/session/${sessionId}/terminate`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (response.status === 200) {
                console.log('Session terminated successfully');
            } else {
                console.warn('Failed to terminate session:', response.status, response.statusText);
            }
        } else {
            console.warn('Session ID not found.');
        }
    } catch (error) {
        console.error('Error terminating session:', error);
    }

    // Delete tokens from store
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId'); // If you also want to clear the session ID from the store

    // Quit the application
    app.quit();
});

ipcMain.on('login-attempt', async (event, { email, password }) => {
    try {
        const response = await axios.post('http://10.147.20.105:3000/v1/account/login', {
            email,
            password,
        });

        if (response.status === 200) {
            const { username, token: { access_token: accessToken, refresh_token: refreshToken } } = response.data;

            store.set('username', username);
            store.set('accessToken', accessToken);
            store.set('refreshToken', refreshToken);

            // Reply with success and username
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
    try {
        const accessToken = store.get('accessToken');

        const response = await axios.post('http://10.147.20.105:3000/v1/auth/token/refresh', {
            access_token: accessToken,
            refresh_token: refreshToken
        });

        if (response.status === 200) {
            const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data;

            store.set('accessToken', newAccessToken);
            store.set('refreshToken', newRefreshToken);
        } else {
            console.warn('Failed to refresh access token');
            // Handle refresh token error
        }
    } catch (error) {
        console.error('Error refreshing access token:', error);
        // Handle refresh token error
    }
});


ipcMain.on('cancel-loading', () => {
    // Check if moonlightProcess is defined and not null
    if (moonlightProcess && !moonlightProcess.killed) {
        // Kill the process if it exists and is not already killed
        moonlightProcess.kill();
    }
    // Redirect to mainpage.html
    mainWindow.loadURL(`file://${__dirname}/mainpage.html`);
});

// maybe not used
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
    const accessToken = store.get('accessToken');
    const sessionId = store.get('sessionId');

    try {
        if (sessionId) {
            const response = await axios.delete(`http://10.147.20.105:3000/v1/session/${sessionId}/terminate`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (response.status === 200) {
                console.log('Session terminated successfully');
            } else {
                console.warn('Failed to terminate session:', response.status, response.statusText);
            }
        } else {
            console.warn('Session ID not found.');
        }
    } catch (error) {
        console.error('Error terminating session:', error);
    }

    // Delete tokens from store
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId'); // If you also want to clear the session ID from the store

    // Load the login page
    mainWindow.loadURL(`file://${path.join(__dirname, 'login.html')}`);
});
