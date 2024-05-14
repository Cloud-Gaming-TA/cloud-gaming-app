let ipcRenderer;
if (window && window.process && window.process.type === 'renderer') {
    ipcRenderer = require('electron').ipcRenderer;
}


// Function to handle cancel button click
const cancelLoading = () => {
    // Send an IPC message to the main process to cancel loading
    ipcRenderer.send('cancel-loading');
};

// Function to refresh access token using refresh token
const refreshAccessToken = () => {
    // Send an IPC message to the main process to refresh access token
    ipcRenderer.send('refresh-access-token');
};

// Function to update loading bar
const updateLoadingBar = (progress) => {
    // Find the loading bar element
    const loadingBar = document.getElementById('primaryLoadingBar');

    // Ensure progress is within valid range (0 - 100)
    const validProgress = Math.min(Math.max(progress, 0), 100);

    // Set the width of the loading bar based on the progress
    loadingBar.style.width = `${validProgress}%`;

    // Optionally, update any text or visual indicators associated with the loading progress
};

function setDoneState() {
    const loadingIcon = document.getElementById('loadingIcon');
    const loadingText = document.querySelector('.loading-container h2');
    const loadingButton = document.getElementById('cancelButton');
    loadingIcon.src = './img/done.png';
    loadingText.textContent = 'Done!';
    loadingButton.textContent = 'Go back';
    loadingIcon.classList.add('centered');
}

// Add event listener to the cancel button when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    refreshAccessToken();
    document.getElementById('cancelButton').addEventListener('click', cancelLoading);
    // Send requests for network ID and session ID when the DOM is loaded
    ipcRenderer.invoke('get-username').then(username => {
        console.log("Username is:", username);
    }).catch(error => {
        console.error("Error getting username:", error);
    });

    ipcRenderer.send('get-session-id');

    // Receive session ID from main process
    ipcRenderer.on('session-id', (event, sessionId) => {
        console.log("session id is :", sessionId);
        if (sessionId) {
            // Set loading bar to 33% when session ID is available
            updateLoadingBar(33);

            // Increment loading progress gradually until network ID is available
            let progress = 33;
            const increment = 0.05; // Increment per animation frame (adjust as needed)
            const targetProgress = 90; // Target progress when network ID is available

            const animateProgress = () => {
                if (progress < targetProgress) {
                    progress += increment; // Increment progress
                    if (progress > targetProgress) progress = targetProgress; // Ensure progress does not exceed target
                    updateLoadingBar(progress); // Update loading bar

                    // Add a delay before the next frame update
                    setTimeout(() => {
                        animateProgress(); // Continue animation
                    }, 50); // Adjust the delay duration (in milliseconds) as needed
                }
            };
            animateProgress(); // Start animation

            // Execute code related to session ID here if needed
        }
    });

    // Receive network ID from main process
    ipcRenderer.on('network-id', (event, networkId) => {
        console.log("network id is :", networkId);
        // Set loading bar to 100% when network ID is available
        updateLoadingBar(100);
        setDoneState();
    });
});