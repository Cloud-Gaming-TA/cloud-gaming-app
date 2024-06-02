let ipcRenderer;
if (window && window.process && window.process.type === 'renderer') {
    ipcRenderer = require('electron').ipcRenderer;
    console.log('ipcRenderer:', ipcRenderer); // Check ipcRenderer value
}

// Listen for the 'open-moonlight' event from the main process
ipcRenderer.on('open-moonlight', () => {
    console.log("Received open-moonlight event from main process");
});

// Function to open the Moonlight app
const openApp = () => {
    console.log("Attempting to open Moonlight app");
    // Navigate to the loading page after a delay
    ipcRenderer.send('open-moonlight');
    console.log("Button pressed");

    // Add a delay of 2 seconds (2000 milliseconds) before navigating
    setTimeout(() => {
        window.location.href = "./loading.html";
    }, 0);
};

// Function to quit the Electron app
const quitApp = () => {
    // Send an IPC message to the main process to quit the app
    ipcRenderer.send('quit-app');
};

// Function to handle logout
const logout = () => {
    // Redirect to login page or perform any logout logic
    ipcRenderer.send('logout');
};

// Function to refresh access token using refresh token
const refreshAccessToken = () => {
    // Send an IPC message to the main process to refresh access token
    ipcRenderer.send('refresh-access-token');
};

// Add event listeners to the buttons when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add event listener to the logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Add event listener to the open app button
    document.getElementById('openAppBtn').addEventListener('click', openApp);

    // Add event listener to the quit app button
    document.getElementById('quitAppBtn').addEventListener('click', quitApp);

    refreshAccessToken()

    // Refresh access token when DOM is loaded
    setInterval(refreshAccessToken, 2 * 60 * 1000);

    ipcRenderer.invoke('get-username').then((username) => {
        // Update the HTML or perform any actions with the username
        const welcomeMessage = document.getElementById('welcomeMessage');
        welcomeMessage.innerHTML = `Welcome, <span class="animated-text-color">${username}</span>`;
    }).catch((error) => {
        console.error('Error retrieving username:', error);
    });

});
