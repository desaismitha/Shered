# Architecture Overview

## Overview

This application is a trip planning and management platform that allows users to organize trips, manage groups, track expenses, and coordinate travel logistics. The system uses a modern fullstack architecture with React on the frontend and Node.js/Express on the backend, with a PostgreSQL database for data persistence.

## System Architecture

The application follows a client-server architecture with the following high-level components:

- **Frontend**: React-based SPA using TypeScript, managed with Vite
- **Backend**: Node.js/Express server using TypeScript
- **Database**: PostgreSQL (via Neon's serverless offering)
- **ORM**: Drizzle ORM for database interactions
- **Authentication**: Session-based authentication with Passport.js
- **Real-time Communication**: WebSockets for real-time updates
- **External Services**: Mapbox for mapping, Twilio for SMS, SendGrid for email

```
┌─────────────┐      ┌────────────────┐      ┌──────────────┐
│             │      │                │      │              │
│   React     │◄────►│  Express.js    │◄────►│  PostgreSQL  │
│  Frontend   │      │    Server      │      │   Database   │
│             │      │                │      │              │
└─────────────┘      └────────────────┘      └──────────────┘
                            │
                            │
                     ┌──────▼──────┐
                     │ External    │
                     │ Services    │
                     │ - Mapbox    │
                     │ - Twilio    │
                     │ - SendGrid  │
                     └─────────────┘
```

## Key Components

### Frontend Architecture

The frontend is built with React and TypeScript using the following key technologies:

- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **Form Handling**: React Hook Form with Zod for validation
- **UI Components**: Custom components with shadcn/ui library, built on Radix UI primitives
- **Styling**: Tailwind CSS for utility-first styling

Key frontend directories:
- `/client/src/pages`: React components representing application pages
- `/client/src/components`: Reusable UI components
- `/client/src/hooks`: Custom React hooks
- `/client/src/lib`: Utility functions and helpers

### Backend Architecture

The backend is a Node.js/Express server with the following key features:

- **API**: RESTful API endpoints for data operations
- **Authentication**: Session-based authentication with Passport.js
- **Database Access**: Drizzle ORM for typesafe database access
- **File Uploads**: Express-fileupload for handling file uploads
- **Real-time**: WebSocket server for real-time communication

Key backend directories:
- `/server`: Server-side code
- `/server/db.ts`: Database connection and configuration
- `/server/routes.ts`: API route definitions
- `/server/auth.ts`: Authentication logic
- `/server/storage.ts`: Data access layer

### Data Model

The application uses a structured relational data model with the following key entities:

- **Users**: Account information, authentication details, and driver eligibility
- **Groups**: Collections of users who travel together
- **Trips**: Travel plans with destinations, dates, and routes
- **Itinerary Items**: Scheduled activities within trips
- **Expenses**: Cost tracking for trips
- **Vehicles**: User-owned vehicles available for trips
- **Messages**: Communication between group members

The schema is defined in `/shared/schema.ts` using Drizzle ORM's schema definition syntax.

### Authentication and Authorization

The system uses a multi-layered authentication approach:

1. **Basic Authentication**: Username/password with secure password hashing
2. **Email Verification**: Verification tokens sent via email
3. **OTP Verification**: One-time passwords for sensitive operations
4. **Session Management**: Express sessions stored in the database

User permissions are role-based, with different access levels for trip owners vs. members.

## Data Flow

### User Authentication Flow

1. User registers with email, username, and password
2. System sends email verification link
3. User confirms email by clicking the link
4. User can then log in with username/password
5. Sessions are maintained via cookies

### Trip Management Flow

1. User creates a trip with basic details (name, dates, locations)
2. Trip can be associated with a group of travelers
3. Itinerary items can be added to the trip schedule
4. Expenses can be recorded and associated with the trip
5. Vehicles can be assigned for transportation
6. Real-time location tracking during active trips

### Real-time Updates

The application uses WebSockets for real-time features:
- Trip location updates
- Group messaging
- Notifications for trip changes or deviations

## External Dependencies

### Third-party Services

- **Mapbox**: Map visualization and route planning
- **Twilio**: SMS notifications and OTP delivery
- **SendGrid**: Email delivery for verification and notifications
- **Neon Database**: Serverless PostgreSQL hosting

### NPM Packages

Key dependencies include:
- **Drizzle ORM**: Database ORM
- **TanStack Query**: Data fetching and caching
- **Radix UI**: Accessible UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Zod**: Schema validation
- **Passport.js**: Authentication middleware
- **ws**: WebSocket implementation

## Deployment Strategy

The application is configured for deployment on Replit with the following characteristics:

1. **Build Process**: 
   - Frontend: Vite builds static assets
   - Backend: esbuild bundles the server code

2. **Runtime Configuration**:
   - Node.js 20 for server runtime
   - PostgreSQL 16 for database
   - Environment variables for service credentials

3. **Scaling Strategy**:
   - Configured for autoscaling deployment

4. **Database Migrations**:
   - Drizzle Kit for schema migrations
   - Migration scripts in the `/migrations` directory

5. **Development Environment**:
   - Development mode with hot reloading
   - Debug tools and monitoring

## Security Considerations

- Secure password storage with scrypt hashing
- HTTPS for all communications
- Session authentication with secure cookies
- Email and phone verification for critical actions
- Input validation with Zod schemas
- Protection against common web vulnerabilities