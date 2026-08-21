
  # Resource Planning Application

  A comprehensive resource planning application built with React, data grids (Glide Data Grid and AG Grid), Prisma ORM, and a SQLite database. This application allows you to manage projects, resources, a shared rate card, and create detailed resource plans with weekly or monthly allocations.

  ## Features

  ### Database Integration
  - **SQLite Database**: Persistent data storage using Prisma ORM
  - **Project Management**: Create and manage multiple projects with settings
  - **Resource Lists**: Manage available resources with roles, names, and rates
  - **Global Rate Card**: A single shared rate card (common to all projects), importable from Excel with regional pricing
  - **Resource Plans**: Create detailed resource plans with variable per-period allocations
  - **Allocations**: Track resource allocation percentages per planning period (weekly or monthly)

  ### Grid Integration
  - **Two grid libraries**: Glide Data Grid (Resource Plan / Client view) and AG Grid (Resource List / Rate Card)
  - **Editable Grids**: Inline editing for all data fields
  - **Dynamic Columns**: Variable number of planning periods (weeks or months)
  - **Real-time Calculations**: Automatic cost and effort calculations
  - **Excel Import**: Import the rate card from Excel files
  - **Sorting and Filtering**: Advanced grid features for data management

  ### API Endpoints
  - **Project Management**: CRUD operations for projects
  - **Resource Lists**: Manage resource availability
  - **Rate Card**: Handle the global rate card data and Excel imports
  - **Resource Plans**: Manage planning data with per-period allocations
  - **Allocations**: Track resource allocation by planning period

  ## Database Schema

  > Authoritative schema: [`prisma/schema.prisma`](prisma/schema.prisma). The summary below is for orientation — if the two disagree, the `.prisma` file wins.

  ### Models
  1. **Project**: Project configuration and settings
  2. **GlobalRateCard**: Shared rate card data imported from Excel (not project-scoped)
  3. **RateCardImportMeta**: Singleton (id = 1) holding metadata about the last rate card import
  4. **ResourceList**: Available resources for a project
  5. **ResourcePlan**: Planning rows with a variable number of periods
  6. **Allocation**: Resource allocation by planning period

  ### Relationships
  - A Project has many Resource Lists and Resource Plans
  - A Resource Plan has many Allocations
  - The rate card (`GlobalRateCard`) is global — shared across all projects, not related to any single project
  - Project/Resource Plan relationships use foreign keys with cascade deletes

  ## Getting Started

  ### Prerequisites
  - Node.js (v20 or higher)
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

  ### Multiproject and Project list
  - Use the **Project list** tab to see all projects (name, description, created, last updated)
  - Open a project to work on its Resource Plan, Resource List, and Rate Card
  - Create new projects with "New project" or delete projects (and all their data) from the list
  - Edit project name and description from the Project list

  ### Project Management
  - The application automatically creates a default project on first run if none exist
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
  - Create resource plans with variable per-period allocations (weekly or monthly)
  - Add/remove planning periods dynamically, and convert a project between weekly and monthly
  - Set allocation percentages (0-100%) for each period
  - View calculated costs, efforts, and margins
  - Auto-populate rates when selecting roles from resource list

  ## API Documentation

  ### Base URL
  `http://localhost:3001/api`

  ### Endpoints

  > The list below is the authoritative API reference and is verified against `server.ts` by an automated test (`readme.test.ts`). If you add, remove, or rename a route, update this list — `npm test` will fail otherwise.

  #### Projects
  - `GET /projects` - Get all projects
  - `GET /projects/:id` - Get project with all related data
  - `POST /projects` - Create new project
  - `PUT /projects/:id` - Update project
  - `DELETE /projects/:id` - Delete project (cascades to resource lists, resource plans, and their allocations)
  - `POST /projects/:id/copy` - Duplicate a project with all of its data
  - `GET /projects/:id/export` - Export a project (lists, plans, allocations, and WBS) as JSON
  - `POST /projects/import` - Import a project from JSON (including WBS tree + estimates)

  #### Rate Card (global — shared across all projects)
  - `GET /rate-cards` - Get the global rate card
  - `GET /rate-cards/meta` - Get metadata about the last rate card import
  - `POST /rate-cards` - Create a rate card entry
  - `POST /rate-cards/bulk` - Bulk import/replace rate card entries (Excel import)
  - `PUT /rate-cards/:id` - Update a rate card entry
  - `DELETE /rate-cards/:id` - Delete a rate card entry
  - `DELETE /rate-cards` - Clear the entire rate card

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
  - `PUT /projects/:projectId/resource-plans/reorder` - Reorder a project's resource plans
  - `POST /projects/:id/convert-planning-mode` - Convert a project between weekly and monthly planning

  #### Allocations
  - `GET /resource-plans/:resourcePlanId/allocations` - Get allocations for a resource plan
  - `POST /resource-plans/:resourcePlanId/allocations` - Create an allocation
  - `PUT /allocations/:id` - Update an allocation
  - `DELETE /allocations/:id` - Delete an allocation

  #### AI Planner
  - `POST /projects/generate-plan` - Generate a draft resource plan from a natural-language description (read-only; rate-limited per IP)

  #### WBS
  - `GET /projects/:projectId/wbs` - Get the flat list of WBS items (with estimates) for a project
  - `POST /projects/:projectId/wbs-items` - Create a WBS item (optionally with nested estimates)
  - `PUT /wbs-items/:id` - Update a WBS item's scalar fields (name, parentId, phaseName, displayOrder)
  - `DELETE /wbs-items/:id` - Delete a WBS item (cascades to its subtree and their estimates)
  - `PUT /wbs-items/:id/estimates` - Replace all estimates for a WBS item (delete-then-recreate)

  #### Roadmap
  - `GET /projects/:id/roadmap` - Get the roadmap (lanes, each with its items and their linked WBS node ids)
  - `POST /projects/:id/roadmap/lanes` - Create a lane, appended at the end
  - `PATCH /roadmap-lanes/:id` - Update a lane's name/displayOrder
  - `DELETE /roadmap-lanes/:id` - Delete a lane (cascades to its items and their links)
  - `POST /projects/:id/roadmap/items` - Create a bar or milestone in a lane
  - `PATCH /roadmap-items/:id` - Update an item's name/lane/kind/window/displayOrder
  - `DELETE /roadmap-items/:id` - Delete an item (cascades its links)
  - `PUT /roadmap-items/:id/links` - Replace an item's direct WBS links
  - `PUT /wbs-items/:id/roadmap-link` - Set or clear a WBS node's direct roadmap link
  - `POST /projects/:id/roadmap/bulk` - Bootstrap a roadmap from the WBS (refused with 409 unless the roadmap is empty)

  ## Development

  ### Project Structure
  ```
  ├── prisma/
  │   └── schema.prisma            # Database schema (source of truth)
  ├── src/
  │   ├── App.tsx                  # Main application component (holds top-level state)
  │   ├── components/              # React components
  │   │   ├── ResourcePlan.tsx     # Main planning component (Glide Data Grid)
  │   │   ├── ResourceList.tsx     # Resource management (AG Grid)
  │   │   ├── RateCard.tsx         # Rate card management (AG Grid)
  │   │   ├── ClientView.tsx       # Client-facing view (Glide Data Grid)
  │   │   └── ui/                  # Reusable UI primitives (Radix/shadcn-style)
  │   ├── services/
  │   │   └── api.ts               # API service functions (all server I/O)
  │   ├── config/defaults.ts       # App defaults, locations, currencies
  │   ├── utils/                   # Calculations, phases, mode conversion
  │   └── generated/prisma/        # Generated Prisma client (do not edit)
  ├── server.ts                    # Express API server (single file)
  ├── server-validation.ts         # Zod request-validation schemas
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
  6. **Update this README's API Endpoints list** if you changed any routes (the `readme.test.ts` drift check enforces this)

  ### Keeping this README accurate
  This README rotted once because it duplicated details that live in code. To prevent that:
  - **Source of truth lives in code.** For anything beyond a high-level overview, link to the real file (`prisma/schema.prisma`, `server.ts`, `src/services/api.ts`) instead of re-describing it here. Conventions and gotchas are captured in [`_bmad-output/project-context.md`](_bmad-output/project-context.md).
  - **The API list is test-guarded.** `readme.test.ts` parses the routes out of `server.ts` and fails `npm test` if the README's endpoint list drifts (missing, extra, or renamed routes). Keep the two in sync.

  ## Technologies Used

  - **Frontend**: React 18, TypeScript, Vite
  - **UI Components**: Radix UI, Tailwind CSS v4
  - **Grids**: Glide Data Grid and AG Grid Community
  - **Backend**: Express 5, Node.js (run via `tsx`)
  - **Database**: SQLite with Prisma ORM
  - **Validation**: Zod
  - **Excel Processing**: ExcelJS

  ## Deployment

  Production builds are served by the Express server from the `build/` directory. See [DEPLOYMENT.md](DEPLOYMENT.md) for VM (`npm run deploy`) and Docker (`Dockerfile` / `docker-compose.yml`) instructions.

  ## License

  <!-- NOTE: package.json marks this project as "private" and no LICENSE file is present.
       Confirm the intended license before publishing, or remove this section. -->
  This project is licensed under the MIT License.
  