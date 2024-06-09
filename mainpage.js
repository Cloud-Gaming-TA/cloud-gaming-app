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
    console.log("Button pressed");

    const selectedGPU = document.querySelector('.dropdown-content .selected')?.dataset.gpuName;
    console.log("You choose:", selectedGPU);
    if (selectedGPU) {
        ipcRenderer.send('open-moonlight', { gpuName: selectedGPU });
    } else {
        alert('Please select a GPU');
        return;
    }

    setTimeout(() => {
        ipcRenderer.invoke('get-session-id-status-code').then(sesIdStatCode => {
            setTimeout(() => {
                if (sesIdStatCode === 404) {
                    window.location.href = "./queue.html";
                    console.log("Yay!")
                } else {
                    window.location.href = "./loading.html";
                    console.log("no error i guess?");
                }
            }, 0); // Add a delay of 0 milliseconds before navigating
        }).catch(error => {
            console.error("Error getting status code!", error); // Log the error message
        });
    }, 3000); // Initial delay of 3 seconds before invoking the IPC method
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

    // Request GPU list from main process
    ipcRenderer.send('request-gpu-list');

    // Handle GPU list received from main process
    ipcRenderer.on('gpu-list', (event, gpus) => {
        populateGPUDropdown(gpus);
    });

    // Add event listener to the logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Add event listener to the open app button
    document.getElementById('openAppBtn').addEventListener('click', openApp);

    // Add event listener to the quit app button
    document.getElementById('quitAppBtn').addEventListener('click', quitApp);

    refreshAccessToken();

    // Refresh access token when DOM is loaded
    setInterval(refreshAccessToken, 2 * 60 * 1000);

    ipcRenderer.invoke('get-username').then((username) => {
        // Update the HTML or perform any actions with the username
        const welcomeMessage = document.getElementById('welcomeMessage');
        welcomeMessage.innerHTML = `Welcome, <span class="animated-text-color">${username}</span>`;
    }).catch((error) => {
        console.error('Error retrieving username:', error);
    });

    // Function to populate GPU dropdown
    function populateGPUDropdown(gpus) {
        const dropdownContent = document.getElementById('gpuDropdown');
        const gpuSelectButton = document.getElementById('gpuSelectButton');
        gpus.forEach(gpu => {
            const gpuElement = document.createElement('a');
            gpuElement.href = '#';
            gpuElement.textContent = gpu.gpu_name;
            gpuElement.dataset.gpuName = gpu.gpu_name;
            gpuElement.addEventListener('click', (event) => {
                event.preventDefault();
                document.querySelectorAll('.dropdown-content a').forEach(el => el.classList.remove('selected'));
                gpuElement.classList.add('selected');
                gpuSelectButton.textContent = gpu.gpu_name; // Update button text
            });
            dropdownContent.appendChild(gpuElement);
        });
    }

});
