# Veterinary Management System - Happy Animals

## Overview

Happy Animals is a comprehensive veterinary practice management system built with a modern full-stack architecture. The application provides complete functionality for managing veterinary clinics, including patient records, appointment scheduling, medical history tracking, billing, and inventory management. The system is designed specifically for veterinary professionals to streamline their daily operations and improve patient care.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and modern development
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **UI Framework**: Shadcn/ui components built on Radix UI primitives for accessible, customizable components
- **Styling**: Tailwind CSS with CSS variables for theming and responsive design
- **Form Handling**: React Hook Form with Zod validation for type-safe form management
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework for RESTful API endpoints
- **Language**: TypeScript for type safety across the entire stack
- **Database ORM**: Drizzle ORM with PostgreSQL for type-safe database operations
- **Authentication**: Replit Auth integration with OpenID Connect for secure user management
- **Session Management**: Express sessions with PostgreSQL storage using connect-pg-simple
- **API Design**: RESTful endpoints organized by resource (patients, owners, appointments, etc.)

### Database Design
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **Schema Management**: Drizzle migrations for version-controlled database changes
- **Key Entities**: 
  - Users (veterinarians/staff with role-based access)
  - Owners (pet owners/clients)
  - Patients (animals with species, breed, medical info)
  - Appointments (scheduling with status tracking)
  - Medical Records (treatment history and notes)
  - Invoices and Invoice Items (billing system)
  - Inventory Items (supply management with low-stock alerts)

### Authentication & Authorization
- **Provider**: Replit Auth using OpenID Connect protocol
- **Session Storage**: PostgreSQL-backed sessions for scalability
- **Security**: HTTP-only cookies with secure flags for production
- **User Management**: Profile information stored locally with external auth integration

### File Structure & Organization
- **Monorepo Structure**: Client, server, and shared code in organized directories
- **Shared Schema**: Common TypeScript types and Zod schemas in `/shared` directory
- **Path Aliases**: Clean imports using `@/` for client code and `@shared/` for shared utilities
- **Component Organization**: Feature-based organization with reusable UI components

## External Dependencies

### Core Technologies
- **Database**: Neon PostgreSQL serverless database
- **Authentication**: Replit Auth (OpenID Connect)
- **Hosting**: Replit platform with integrated development environment

### Frontend Libraries
- **UI Components**: Radix UI primitives for accessibility and customization
- **Form Validation**: Zod for runtime type checking and validation
- **Date Handling**: date-fns for date manipulation and formatting
- **Icons**: Lucide React for consistent iconography
- **Styling**: Tailwind CSS with class-variance-authority for component variants

### Backend Dependencies
- **WebSocket Support**: ws library for Neon database connections
- **Session Management**: connect-pg-simple for PostgreSQL session storage
- **Security**: OpenID Client for authentication flows
- **Development**: tsx for TypeScript execution and hot reloading

### Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Code Quality**: TypeScript compiler with strict mode enabled
- **Development Plugins**: Replit-specific plugins for cartographer and error overlay
- **Package Management**: npm with lockfile for dependency consistency