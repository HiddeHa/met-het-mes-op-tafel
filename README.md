# Met het Mes op Tafel

A web-based implementation of the Dutch TV game show "Met het Mes op Tafel".

## Features

- Online multiplayer using Socket.IO
- Question management with import/export capabilities
- Minimalistic polished UI
- Extensible architecture for future features

## Project Structure

- `client/` – React (Vite) frontend
- `server/` – Node.js/Express/Socket.IO backend

## Getting Started

### Prerequisites

- Node.js (>=14)
- npm or yarn

### Installation

```bash
# Clone the repository (if not already)
git clone <repository-url>
cd met het mes op tafel

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running the Game

#### Start the server

```bash
cd server
npm start
```
The server will run on `http://localhost:5000`.

#### Start the client

```bash
cd client
npm run dev
```
The client will be available at `http://localhost:5173` (or as shown in the terminal).

### Development

- The client uses React with Vite for fast hot‑module replacement.
- The server uses Express and Socket.IO for real‑time communication.
- Question data can be imported/exported via a simple JSON format (to be implemented).

## License

MIT