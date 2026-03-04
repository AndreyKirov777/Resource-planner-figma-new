
  # Resource Planning Application

  A comprehensive resource planning application built with React, AG-Grid, Prisma ORM, and SQLite database. This application allows you to manage projects, resources, rate cards, and create detailed resource plans with weekly allocations.

  ## Features

  ### Database Integration
  - **SQLite Database**: Persistent data storage using Prisma ORM
  - **Project Management**: Create and manage multiple projects with settings
  - **Resource Lists**: Manage available resources with roles, names, and rates
  - **Rate Cards**: Import and manage rate cards from Excel files with regional pricing
  - **Resource Plans**: Create detailed resource plans with variable weekly allocations
  - **Weekly Allocations**: Track resource allocation percentages by week

  ### AG-Grid Integration
  - **Editable Grids**: Inline editing for all data fields
  - **Dynamic Columns**: Variable number of weeks in resource planning
  - **Real-time Calculations**: Automatic cost and effort calculations
  - **Excel Import**: Import rate cards from Excel files
  - **Sorting and Filtering**: Advanced grid features for data management

  ### API Endpoints
  - **Project Management**: CRUD operations for projects
  - **Resource Lists**: Manage resource availability
  - **Rate Cards**: Handle rate card data and Excel imports
  - **Resource Plans**: Manage planning data with weekly allocations
  - **Weekly Allocations**: Track resource allocation by week

  ## Database Schema

  ### Tables
  1. **Project**: Project configuration and settings
  2. **Rate_card**: Rate card data imported from Excel
  3. **Resource_list**: Available resources for projects
  4. **Resource_plan**: Planning table with variable weeks
  5. **Weekly_allocations**: Resource allocation by week

  ### Relationships
  - Projects have many Rate Cards, Resource Lists, and Resource Plans
  - Resource Plans have many Weekly Allocations
  - All relationships use proper foreign keys with cascade deletes

  ## Getting Started

  ### Prerequisites
  - Node.js (v16 or higher)
  - npm or yarn

  ### Installation

  1. Clone the repository:
  ```bash
  git clone <repository-url>
  cd resource-planner-figma
  ```

  2. Install dependencies:
  ```bash
  npm install
  ```

  3. Set up the database:
  ```bash
  npx prisma generate
  npx prisma db push
  ```

  4. Start the backend server:
  ```bash
  npm run server
  ```

  5. Start the frontend development server:
  ```bash
  npm run dev
  ```

  6. Open your browser and navigate to `http://localhost:5173`

  ## Usage

  ### Project Management
  - The application automatically creates a default project on first run
  - Modify project settings like currency, exchange rates, and FTE days
  - All data is automatically saved to the database

  ### Resource Lists
  - Add new resources with roles, names, and internal rates
  - Edit existing resources inline in the AG-Grid
  - Delete resources as needed
  - View statistics like total resources and average rates

  ### Rate Cards
  - Import rate cards from Excel files (requires "RMNG RATES" sheet)
  - Edit rate card data inline
  - View regional pricing for different locations
  - Add new rate card entries manually

  ### Resource Planning
  - Create resource plans with variable weekly allocations
  - Add/remove weeks dynamically
  - Set allocation percentages (0-100%) for each week
  - View calculated costs, efforts, and margins
  - Auto-populate rates when selecting roles from resource list

  ## API Documentation

  ### Base URL
  `http://localhost:3001/api`

  ### Endpoints

  #### Projects
  - `GET /projects` - Get all projects
  - `GET /projects/:id` - Get project with all related data
  - `POST /projects` - Create new project
  - `PUT /projects/:id` - Update project

  #### Rate Cards
  - `GET /projects/:projectId/rate-cards` - Get rate cards for project
  - `POST /projects/:projectId/rate-cards` - Create rate card
  - `PUT /rate-cards/:id` - Update rate card
  - `DELETE /rate-cards/:id` - Delete rate card

  #### Resource Lists
  - `GET /projects/:projectId/resource-lists` - Get resource list for project
  - `POST /projects/:projectId/resource-lists` - Create resource
  - `PUT /resource-lists/:id` - Update resource
  - `DELETE /resource-lists/:id` - Delete resource

  #### Resource Plans
  - `GET /projects/:projectId/resource-plans` - Get resource plans for project
  - `POST /projects/:projectId/resource-plans` - Create resource plan
  - `PUT /resource-plans/:id` - Update resource plan
  - `DELETE /resource-plans/:id` - Delete resource plan

  #### Weekly Allocations
  - `GET /resource-plans/:resourcePlanId/weekly-allocations` - Get weekly allocations
  - `POST /resource-plans/:resourcePlanId/weekly-allocations` - Create weekly allocation
  - `PUT /weekly-allocations/:id` - Update weekly allocation
  - `DELETE /weekly-allocations/:id` - Delete weekly allocation

  ## Development

  ### Project Structure
  ```
  ├── prisma/
  │   └── schema.prisma          # Database schema
  ├── src/
  │   ├── components/            # React components
  │   │   ├── ResourcePlan.tsx   # Main planning component
  │   │   ├── ResourceList.tsx   # Resource management
  │   │   ├── RateCard.tsx       # Rate card management
  │   │   └── ui/                # UI components
  ├── services/
  │   └── api.ts            # API service functions
  ├── generated/
  │   └── prisma/           # Generated Prisma client
  └── App.tsx               # Main application component
 ├── server.ts                 # Express API server
 └── package.json
  ```

  ### Database Operations
  - **Prisma Client**: Auto-generated from schema
  - **Migrations**: Use `npx prisma migrate dev` for schema changes
  - **Database Browser**: Use `npx prisma studio` to view/edit data

  ### Adding New Features
  1. Update the Prisma schema if needed
  2. Run `npx prisma generate` to update the client
  3. Add API endpoints in `server.ts`
  4. Update API service functions in `src/services/api.ts`
  5. Modify React components as needed

  ## Technologies Used

  - **Frontend**: React 18, TypeScript, Vite
  - **UI Components**: Radix UI, Tailwind CSS
  - **Grid**: AG-Grid Community
  - **Backend**: Express.js, Node.js
  - **Database**: SQLite with Prisma ORM
  - **Excel Processing**: ExcelJS

  ## License

  This project is licensed under the MIT License.
  