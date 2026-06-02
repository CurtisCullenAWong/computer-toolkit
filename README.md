# Computer Toolkit

The Computer Toolkit is a feature-rich application built with **Tauri**, **React**, and **TypeScript**, meant to simplify common system tasks and provide tools for users on Windows.

## System Information
The toolkit provides detailed insights on your system's hardware and software configurations, such as:
- CPU and GPU usage in real-time
- Memory utilization
- Storage details and capacities
- Installed applications
- Network and connectivity information

## Key Features
- **User-Friendly Interface**: Simple and intuitive design for all skill levels.
- **Hardware Monitoring**: Track and monitor real-time hardware statistics.
- **Application Management**: Manage installed programs, including uninstallations.
- **Network Tools**: Test connectivity and view configuration.
- **Cross-Platform Flexibility**: While optimized for Windows, core functionalities extend to other operating systems.

## Tech Stack
- **Frontend**: React, TypeScript
- **Backend**: Tauri (Rust-based), Vite
- **Other Libraries/Tools**: Node.js, TailwindCSS

## Windows-First Compatibility
Though the Computer Toolkit is cross-platform, it is developed with a focus on ensuring the best experience on Windows systems. This includes integration with Windows-specific APIs for enhanced functionality.

## Developer Setup and Usage
Follow these steps to set up the development environment on your machine:

### Prerequisites
- Node.js (Latest Version)
- Rust and the Tauri prerequisites ([Tauri Setup](https://tauri.app/v1/guides/getting-started/prerequisites))
- Package Manager: npm or yarn

### Steps
1. **Clone the Repository**
   ```bash
   git clone https://github.com/CurtisCullenAWong/computer-toolkit.git
   ```
   ```bash
   cd computer-toolkit
   ```
2. **Install Dependencies**
   ```bash
   npm install
   ```
   Or
   ```bash
   yarn
   ```
3. **Run the Development Server**
   ```bash
   npm run dev
   ```
   Or
   ```bash
   yarn dev
   ```
4. **Build for Production**
   To generate the production build for deployment:
   ```bash
   npm run tauri build
   ```

## Usage
- After building, navigate to the output application and launch it.
- Upon startup, the application will automatically fetch and display system information.

---
This toolkit is a work in progress—contributions are welcome! If you experience any issues, please report them via the **[Issues](https://github.com/CurtisCullenAWong/computer-toolkit/issues)** section.