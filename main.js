import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import psList from 'ps-list';
import Store from 'electron-store';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store();

let mainWindow = null;
let changeVar = 0;
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

    mainWindow.on('closed', async () => {
        console.log('Closed, Goodbye 1!');
        const accessToken = store.get('accessToken');
        const sessionId = store.get('sessionId');
        const networkId = store.get('networkId');

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

        try {
            if (networkId) {
                const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientEnd.ps1');
                const args = [
                    '-network_id', networkId
                ];
                // Spawn the PowerShell process
                const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
                    stdio: 'inherit', // Show the terminal window
                    windowsHide: true // Ensure the terminal window is not hidden
                });
            } else {
                console.warn('Network ID not found');
            };
        } catch (error) {
            console.error('Error deleting network:', error);
        }
        
        console.log('Closed, Goodbye 2!');
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
    while (true && changeVar === 0) {
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
    let sessionId = ''; // Declare sessionId outside the loop
    let response;

    while (sessionId === '' && changeVar === 0) {
        try {
            const accessToken = store.get('accessToken'); // Get the access token from the store
            response = await axios.post('http://10.147.20.105:3000/v1/games/play', {
                game_id: 1174180,
                username: username
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}` // Include the access token in the Authorization header
                }
            });
            sessionId = response.data.session_id; // Use the sessionId variable declared outside

            store.set('sessionId', sessionId);
            console.log("response: ", response);

            if (sessionId === '') {
                // Add a delay before retrying to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
            }
        } catch (error) {
            console.error('Error fetching session ID:', error);
            throw error; // Handle the error appropriately in your application
        }
    }

    // Once sessionId is available, return it
    return sessionId;
}

async function getNetworkId(sessionId, event) {
    let networkId = ''; // Declare networkId outside the loop
    let response;

    while (networkId === '' && changeVar === 0) {
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
    changeVar = 0;
    try {
        console.log("now I'm going to try!");
        const username = store.get('username');
        const accessToken = store.get('accessToken');

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

        if (sessionId && networkId) {
            // Send the network ID to the renderer process
            mainWindow.webContents.send('network-id', networkId);

            const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientStart.ps1');
            const args = [
                '-network_id', networkId,
                '-session_id', sessionId,
                '-token', accessToken
            ];

            // Spawn the PowerShell process
            const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
                stdio: 'inherit', // Show the terminal window
                windowsHide: true // Ensure the terminal window is not hidden
            });

            console.log("should be running the terminal now?")

            // Check if Moonlight is running mid-process
            const running = await isMoonlightRunning();
            mainWindow.webContents.send('moonlight-status', running);

            checkMoonlightStatus()
        }
        else {
            console.log("Cannot continue process :(");
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

ipcMain.on('quit-app', async () => {
    const networkId = store.get('networkId');

    const scriptPath = path.join(__dirname, './auto-scripts/ZeroTierAuto/controller/clientEnd.ps1');
    const args = [
        '-network_id', networkId
    ];

    // Spawn the PowerShell process
    const moonlightProcess = spawn('powershell.exe', [scriptPath, ...args], {
        stdio: 'inherit', // Show the terminal window
        windowsHide: true // Ensure the terminal window is not hidden
    });

    // Delete tokens from store
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId'); // If you also want to clear the session ID from the store
    store.delete('username');

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
    const accessToken = store.get('accessToken');
    try {
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
        console.error('Error refreshing access token');
        // Handle refresh token error
    }
});

ipcMain.on('cancel-loading', async () => {
    const accessToken = store.get('accessToken');
    const sessionId = store.get('sessionId');
    const networkId = store.get('networkId');

    try {
        if (sessionId) {
            const response = await axios.delete(`http://10.147.20.105:3000/v1/session/${sessionId}/terminate`, {
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
                stdio: 'inherit', // Show the terminal window
                windowsHide: true // Ensure the terminal window is not hidden
            });
        } else {
            console.warn('Network ID not found');
        };
    } catch (error) {
        console.error('Error deleting network:', error);
    }

    changeVar = 1;

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
    // Delete tokens from store
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('sessionId'); // If you also want to clear the session ID from the store
    store.delete('username');

    changeVar = 1;

    // Load the login page
    mainWindow.loadURL(`file://${path.join(__dirname, 'login.html')}`);
});
