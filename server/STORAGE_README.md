# Storage System for Met het Mes op Tafel

This server includes a file-based persistence system to save game states and recover from restarts.

## How It Works

1. **Automatic Saving**: Game states are saved every 30 seconds to `storage/game_states.json`
2. **Startup Loading**: On server startup, saved game states are automatically loaded
3. **Shutdown Handling**: Game states are saved before the server shuts down (SIGINT)
4. **Event-Based Saving**: States are also saved after significant game events (phase changes, bets, etc.)

## Storage Location

- Directory: `./storage/`
- File: `game_states.json`

## Data Format

The storage format is a JSON object where:
- Keys are room IDs
- Values are the complete room state objects

Example:
```json
{
  "room_1234567890": {
    "roomId": "room_1234567890",
    "round": 3,
    "phase": "QUESTIONS",
    "pot": 150,
    "players": [...],
    "questions": [...],
    ...
  }
}
```

## Recovery Process

When the server starts:
1. Checks if `storage/game_states.json` exists
2. If it exists, parses the JSON and reconstructs the Map of rooms
3. If parsing fails or file doesn't exist, starts with an empty Map
4. Logs the number of game states loaded

## Limitations

- File-based storage is suitable for single-instance deployments
- For multi-instance or cloud deployments, consider using Redis or a database
- Storage file can grow large over time with many completed games
- No automatic cleanup of old game states (could be added as a cron job)

## Security Considerations

- Input validation is performed on all socket events
- JSON body size is limited to 10KB to prevent DoS attacks
- CORS is configured to restrict origins in production
- All data stored is game state only (no sensitive user information)

## Production Recommendations

1. For multi-server deployments, replace file storage with Redis or database
2. Implement proper logging rotation
3. Add monitoring for storage file size
4. Consider encrypting storage if sensitive data is ever stored
5. Set up automated backups of the storage directory