# TENDERHUB FRONTEND (React 19 + Vite 8 SPA)

Client-Side Single Page Application for Tender Discovery, Analytics, and Contractor Workspaces.

---

## 1. QUICK START

```bash
# Install dependencies
npm install

# Start Vite development server (port 5173)
npm run dev

# Run automated linter
npm run lint

# Compile production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 2. DIRECTORY STRUCTURE

```
frontend/src/
├── components/          # Reusable UI components
│   ├── Navbar.jsx       # Global header navigation and authentication state
│   ├── Footer.jsx       # Standardized footer with links and disclaimer
│   ├── TenderCard.jsx   # Tender summary card used in listings
│   └── Modal.jsx        # Generic dialog modal
├── context/             # Global React Context providers
│   └── AuthContext.jsx  # Authentication state, login, register, and token management
├── pages/               # Primary route views
│   ├── Home.jsx         # Landing page with hero, features, and live statistics
│   ├── Tenders.jsx      # Public tender directory with search, filters, and pagination
│   ├── TenderDetails.jsx# Detailed view of a single tender with document downloads
│   ├── Services.jsx     # Contractor AI Hub (Dossiers, BOQ, Milestones, Copilot Chat)
│   ├── CheckScore.jsx   # Empirical bid match and qualification calculator
│   ├── Pricing.jsx      # Subscription plans, feature comparisons, and Razorpay checkout
│   ├── Profile.jsx      # Contractor company profile, financials, and saved tenders
│   ├── About.jsx        # Platform background and mission
│   └── Contact.jsx      # Support contact form
├── services/            # Axios API clients
│   ├── api.js           # Base Axios client with request/response interceptors
│   ├── servicesApi.js   # Contractor AI Agent API methods
│   └── billingApi.js    # Subscription and Razorpay checkout methods
├── store/               # Zustand state stores
│   ├── bookmarkStore.js # Client-side tender bookmarking and stage tracking
│   └── preferenceStore.js# Department, district, and notification filter preferences
├── App.jsx              # Root component, router configuration, and layout wrappers
├── main.jsx             # React DOM root entry point
└── index.css            # Tailwind CSS directives and custom styling rules
```

---

## 3. ENVIRONMENT VARIABLES

### Development (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
```

### Production (`frontend/.env.production`)
```env
VITE_API_URL=https://tenderhub-4nbc.onrender.com/api/v1
VITE_RAZORPAY_KEY_ID=rzp_live_TjWTNQzT2o8NCV
```

---

## 4. INTEGRATIONS & PAYMENT FLOW

1. Razorpay Checkout:
   - When the user clicks "Select Plan" in `Pricing.jsx` or `Services.jsx`, `billingApi.createCheckoutOrder(planId)` requests an order ID from the backend.
   - The Razorpay SDK script (`https://checkout.razorpay.com/v1/checkout.js`) opens the checkout modal.
   - Upon successful payment authorization, the callback triggers `billingApi.verifyPayment()`.
   - In parallel, the backend webhook listener processes `payment.captured` for guaranteed server-to-server confirmation.

2. State Management:
   - Server State: Handled via `@tanstack/react-query` with automatic cache revalidation.
   - Client State: Handled via `zustand` stores with `localStorage` synchronization for saved bookmarks.

---

End of Frontend Documentation.
