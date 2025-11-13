import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { ConfigService } from './config/ConfigService';
import { DatabaseService } from './database/DatabaseService';
import { BoltValidator } from './validation/BoltValidator';

/**
 * Initialize and start the application
 */
async function startServer(): Promise<Express> {
  try {
    // Load configuration
    console.log('Loading configuration...');
    const configService = new ConfigService();
    const config = configService.getConfig();
    
    console.log(`Configuration loaded successfully`);
    console.log(`- Port: ${config.port}`);
    console.log(`- Bolt Project Path: ${config.boltProjectPath}`);
    console.log(`- Database Path: ${config.databasePath}`);
    console.log(`- Execution Timeout: ${config.executionTimeout}ms`);
    console.log(`- Command Whitelist Allow All: ${config.commandWhitelist.allowAll}`);
    console.log(`- Command Whitelist Count: ${config.commandWhitelist.whitelist.length}`);

    // Validate Bolt configuration
    console.log('Validating Bolt configuration...');
    const boltValidator = new BoltValidator(config.boltProjectPath);
    await boltValidator.validate();
    console.log('Bolt configuration validated successfully');

    // Initialize database
    console.log('Initializing database...');
    const databaseService = new DatabaseService(config.databasePath);
    await databaseService.initialize();
    console.log('Database initialized successfully');

    // Create Express app
    const app: Express = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Request logging middleware
    app.use((req: Request, _res: Response, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path}`);
      next();
    });

    // Health check endpoint
    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        message: 'Backend API is running',
        config: {
          boltProjectPath: config.boltProjectPath,
          commandWhitelistEnabled: !config.commandWhitelist.allowAll,
          databaseInitialized: databaseService.isInitialized(),
        }
      });
    });

    // Configuration endpoint (excluding sensitive values)
    app.get('/api/config', (_req: Request, res: Response) => {
      res.json({
        commandWhitelist: {
          allowAll: config.commandWhitelist.allowAll,
          whitelist: config.commandWhitelist.allowAll ? [] : config.commandWhitelist.whitelist,
          matchMode: config.commandWhitelist.matchMode,
        },
        executionTimeout: config.executionTimeout,
      });
    });

    // Global error handling middleware
    app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
      console.error('Error:', err);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'An unexpected error occurred',
        },
      });
    });

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`Backend server running on port ${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(async () => {
        await databaseService.close();
        console.log('Server closed');
        process.exit(0);
      });
    });

    return app;
  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Unhandled error during startup:', error);
  process.exit(1);
});

export default startServer;
