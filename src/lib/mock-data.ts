// =============================================================================
// AEMS v2 — Seed & In-Memory Fallback Dataset (Mirrors Migration 003)
// Used when live Supabase connection is pending configuration.
// =============================================================================

import {
  Location,
  Plant,
  Department,
  Category,
  CategoryFormField,
  User,
  UserScope,
  Employee,
  Asset,
  PMMachine,
  PMSchedule,
  PMComplaint,
  DamageScrapReport,
  AuditLog,
} from '@/types/database';

export const SEED_LOCATIONS: Location[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    name: 'Pune',
    code: 'LOC-PUNE',
    address: 'Pune, Maharashtra',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_PLANTS: Plant[] = [
  {
    id: '22222222-2222-2222-2222-222222222201',
    location_id: '11111111-1111-1111-1111-111111111101',
    name: 'NGM',
    code: 'NGM',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    location_id: '11111111-1111-1111-1111-111111111101',
    name: 'PGTL',
    code: 'PGTL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    location_id: '11111111-1111-1111-1111-111111111101',
    name: 'PGEL',
    code: 'PGEL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_USERS: User[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'itadmin@pgel.in',
    full_name: 'IT Admin (AEMS Root)',
    phone: '+91 98765 43210',
    role: 'it_admin',
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'plant.admin@pgel.in',
    full_name: 'Rajesh Sharma (Plant Admin)',
    phone: '+91 98765 43211',
    role: 'admin',
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'hr.lead@pgel.in',
    full_name: 'Pooja Verma (HR Lead)',
    phone: '+91 98765 43212',
    role: 'hr',
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'operator1@pgel.in',
    full_name: 'Amit Kumar (Floor User)',
    phone: '+91 98765 43213',
    role: 'user',
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_SCOPES: UserScope[] = [
  {
    id: 's1',
    user_id: '00000000-0000-0000-0000-000000000001',
    can_edit: true,
    category_ids: null,
    location_ids: null,
    plant_ids: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 's2',
    user_id: '00000000-0000-0000-0000-000000000002',
    can_edit: true,
    category_ids: null,
    location_ids: ['11111111-1111-1111-1111-111111111101'],
    plant_ids: ['22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 's3',
    user_id: '00000000-0000-0000-0000-000000000003',
    can_edit: true,
    category_ids: null,
    location_ids: null,
    plant_ids: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 's4',
    user_id: '00000000-0000-0000-0000-000000000004',
    can_edit: true,
    category_ids: null,
    location_ids: null,
    plant_ids: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_DEPARTMENTS: Department[] = [
  {
    id: '33333333-3333-3333-3333-333333333301',
    name: 'Information Technology',
    code: 'DEPT-IT',
    admin_user_id: '00000000-0000-0000-0000-000000000001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333302',
    name: 'Production & Assembly',
    code: 'DEPT-PROD',
    admin_user_id: '00000000-0000-0000-0000-000000000002',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333303',
    name: 'Quality Assurance',
    code: 'DEPT-QA',
    admin_user_id: '00000000-0000-0000-0000-000000000002',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333304',
    name: 'Human Resources',
    code: 'DEPT-HR',
    admin_user_id: '00000000-0000-0000-0000-000000000003',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333305',
    name: 'Plant Maintenance & Electrical',
    code: 'DEPT-MAINT',
    admin_user_id: '00000000-0000-0000-0000-000000000002',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333306',
    name: 'Health, Safety & Environment',
    code: 'DEPT-HSE',
    admin_user_id: '00000000-0000-0000-0000-000000000002',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_CATEGORIES: Category[] = [
  { id: '44444444-4444-4444-4444-444444444401', name: 'IT', code: 'CAT-IT', description: 'Laptops, Desktops, Servers, Switches, Printers', icon: 'Laptop', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444402', name: 'Camera/NVR', code: 'CAT-SEC', description: 'CCTV Cameras, NVR, DVR, Biometric Scanners', icon: 'Video', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444403', name: 'Quality', code: 'CAT-QA', description: 'Calibrated Gauges, Testing Jigs, Spectrometers', icon: 'ShieldCheck', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444404', name: 'Electrical', code: 'CAT-ELEC', description: 'Transformers, VFDs, Control Panels, DG Sets', icon: 'Zap', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444405', name: 'Production', code: 'CAT-PROD', description: 'Molding Machines, Conveyors, SMT Lines, Compressors', icon: 'Cog', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444406', name: 'Safety', code: 'CAT-SAFE', description: 'Fire Extinguishers, Hydrant Systems, PPE Stations', icon: 'Flame', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444407', name: 'Vehicle', code: 'CAT-VEH', description: 'Forklifts, Stackers, Trucks, Company Vehicles', icon: 'Truck', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444408', name: 'Furniture', code: 'CAT-FURN', description: 'Workstations, Conference Tables, Ergonomic Chairs', icon: 'Armchair', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444409', name: 'Software License', code: 'CAT-SW', description: 'CAD/CAM Licenses, ERP Seats, OS Licences', icon: 'Key', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444410', name: 'Maintenance', code: 'CAT-MAINT', description: 'Welding Machines, Hydraulic Presses, Toolkits', icon: 'Wrench', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const SEED_CATEGORY_FIELDS: CategoryFormField[] = [
  { id: 'cf1', category_id: '44444444-4444-4444-4444-444444444401', field_name: 'ram_size', field_label: 'RAM Size', field_type: 'select', options: ['8 GB', '16 GB', '32 GB', '64 GB'], is_required: true, placeholder: 'Select RAM', display_order: 1, created_at: new Date().toISOString() },
  { id: 'cf2', category_id: '44444444-4444-4444-4444-444444444401', field_name: 'storage_capacity', field_label: 'Storage Capacity', field_type: 'select', options: ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD'], is_required: true, placeholder: 'Select Storage', display_order: 2, created_at: new Date().toISOString() },
  { id: 'cf3', category_id: '44444444-4444-4444-4444-444444444401', field_name: 'operating_system', field_label: 'Operating System', field_type: 'select', options: ['Windows 11 Pro', 'Windows 10 Pro', 'Ubuntu Linux'], is_required: true, placeholder: 'Select OS', display_order: 3, created_at: new Date().toISOString() },
  { id: 'cf4', category_id: '44444444-4444-4444-4444-444444444401', field_name: 'processor', field_label: 'Processor Model', field_type: 'text', options: null, is_required: false, placeholder: 'Intel Core i7-13700H', display_order: 4, created_at: new Date().toISOString() },
  { id: 'cf5', category_id: '44444444-4444-4444-4444-444444444403', field_name: 'last_calibration_date', field_label: 'Last Calibration Date', field_type: 'date', options: null, is_required: true, placeholder: '', display_order: 1, created_at: new Date().toISOString() },
  { id: 'cf6', category_id: '44444444-4444-4444-4444-444444444403', field_name: 'calibration_due_date', field_label: 'Calibration Due Date', field_type: 'date', options: null, is_required: true, placeholder: '', display_order: 2, created_at: new Date().toISOString() },
  { id: 'cf7', category_id: '44444444-4444-4444-4444-444444444407', field_name: 'reg_number', field_label: 'Vehicle Registration No.', field_type: 'text', options: null, is_required: true, placeholder: 'UP 16 AB 1234', display_order: 1, created_at: new Date().toISOString() },
];

const FEATURED_EMPLOYEES_RAW = [
  { emp_code: 'TESTP0007', full_name: '8374843', email: 'testp0007@pgel.in', dept: 'ADMIN', loc: 'PUNE,SUPA - 2020', laptopsCount: 0 },
  { emp_code: 'PT200747', full_name: 'ABHIMANYU BAGEL', email: 'abhimanyu.singh4@pgel.in', dept: 'RND NGM', loc: 'PUNE,SUPA - 4010', laptopsCount: 1 },
  { emp_code: 'PT200772', full_name: 'ABHINANDAN KHUSWAH', email: 'ngm.heqa4@pgel.in', dept: 'HE SHOP', loc: 'PUNE,SUPA - 4010', laptopsCount: 1 },
  { emp_code: 'PT201827', full_name: 'ADESH KUMAR', email: 'adesh.kumar4@pgel.in', dept: 'PURCHASE', loc: 'PUNE,SUPA - 2010', laptopsCount: 3 },
  { emp_code: 'NEA00577', full_name: 'ADITY KUMAR', email: 'prodassy.ngm2@pgel.in', phone: '8294984801', dept: 'Production', loc: 'BHIWADI - 4020', laptopsCount: 1 },
  { emp_code: 'PT500303', full_name: 'AKASH YADAV', email: 'akash.yadav8@pgel.in', dept: 'QUALITY', loc: 'BHIWADI - 2040', laptopsCount: 1 },
  { emp_code: 'NGM00043', full_name: 'AKSHIT KALRA', email: 'akshit.kalra8@pgel.in', dept: 'PPC', loc: 'BHIWADI - 4020', laptopsCount: 1 },
];

const EXTRA_NAMES = [
  'AMIT SHARMA', 'ANIL KUMAR', 'ANKIT VERMA', 'ARUN SINGH', 'ASHOK PATEL',
  'BALRAJ CHAUHAN', 'DEEPAK GUPTA', 'GAURAV JOSHI', 'HARISH MALHOTRA', 'JITENDRA YADAV',
  'KAPIL MEHTA', 'MANISH SAXENA', 'NAVEEN DESHMUKH', 'PANKAJ TIWARI', 'PRADEEP REDDY',
  'RAHUL PANDEY', 'RAJESH RATHORE', 'RAMESH KULKARNI', 'SANDEEP MISHRA', 'SANJAY CHOUDHARY',
  'SATISH SHRIVASTAVA', 'SHIVAM DUBEY', 'SURESH AGRAWAL', 'VIKAS THAKUR', 'VISHAL SAINI',
];

const DEPT_LOC_OPTIONS = [
  { dept: 'PRODUCTION', loc: 'BHIWADI - 4020' },
  { dept: 'QUALITY', loc: 'PUNE,SUPA - 4010' },
  { dept: 'MAINTENANCE', loc: 'BHIWADI - 2040' },
  { dept: 'PURCHASE', loc: 'PUNE,SUPA - 2010' },
  { dept: 'TOOLING', loc: 'GREATER NOIDA - 1010' },
  { dept: 'IT DEPT', loc: 'PUNE,SUPA - 2020' },
];

// Generate 135 total employees
const generate135Employees = (): Employee[] => {
  const result: Employee[] = [];

  // Add 7 Featured Employees first
  FEATURED_EMPLOYEES_RAW.forEach((f, idx) => {
    result.push({
      id: `emp-feat-${idx + 1}`,
      emp_code: f.emp_code,
      full_name: f.full_name,
      email: f.email,
      phone: (f as { phone?: string }).phone || `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
      designation: f.dept,
      department_id: '33333333-3333-3333-3333-333333333302',
      plant_id: '22222222-2222-2222-2222-222222222201',
      location_id: '11111111-1111-1111-1111-111111111101',
      status: 'active',
      created_at: new Date(Date.now() - (135 - idx) * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  // Generate remaining 128 employees
  for (let i = 8; i <= 135; i++) {
    const nameIndex = (i - 8) % EXTRA_NAMES.length;
    const name = `${EXTRA_NAMES[nameIndex]} ${Math.floor(i / EXTRA_NAMES.length) > 0 ? Math.floor(i / EXTRA_NAMES.length) : ''}`.trim();
    const code = `PT${200000 + i * 17}`;
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@pgel.in`;
    const dl = DEPT_LOC_OPTIONS[i % DEPT_LOC_OPTIONS.length];

    result.push({
      id: `emp-gen-${i}`,
      emp_code: code,
      full_name: name,
      email,
      phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
      designation: dl.dept,
      department_id: '33333333-3333-3333-3333-333333333302',
      plant_id: '22222222-2222-2222-2222-222222222201',
      location_id: '11111111-1111-1111-1111-111111111101',
      status: 'active',
      created_at: new Date(Date.now() - (135 - i) * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return result;
};

export const SEED_EMPLOYEES: Employee[] = generate135Employees();

// Generate 108 assigned Laptop Assets
const generate108Assets = (): Asset[] => {
  const result: Asset[] = [];
  let assetCounter = 1;

  // 1. Abhimanyu Bagel (1 Laptop)
  result.push({
    id: `ast-lap-${assetCounter}`,
    asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
    name: 'Dell Latitude 5440 Laptop',
    model: 'Latitude 5440',
    category_id: '44444444-4444-4444-4444-444444444401',
    current_location_id: '11111111-1111-1111-1111-111111111101',
    current_plant_id: '22222222-2222-2222-2222-222222222201',
    current_department_id: '33333333-3333-3333-3333-333333333302',
    assigned_employee_id: 'emp-feat-2', // Abhimanyu
    status: 'in_service',
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assetCounter++;

  // 2. Abhinandan Khuswah (1 Laptop)
  result.push({
    id: `ast-lap-${assetCounter}`,
    asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
    name: 'HP ProBook 445 G9 Laptop',
    model: 'ProBook 445 G9',
    category_id: '44444444-4444-4444-4444-444444444401',
    current_location_id: '11111111-1111-1111-1111-111111111101',
    current_plant_id: '22222222-2222-2222-2222-222222222201',
    current_department_id: '33333333-3333-3333-3333-333333333302',
    assigned_employee_id: 'emp-feat-3', // Abhinandan
    status: 'in_service',
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assetCounter++;

  // 3. Adesh Kumar (3 Laptops)
  for (let k = 0; k < 3; k++) {
    result.push({
      id: `ast-lap-${assetCounter}`,
      asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
      name: `Lenovo ThinkPad L14 Gen 4 (${k + 1})`,
      model: 'ThinkPad L14 G4',
      category_id: '44444444-4444-4444-4444-444444444401',
      current_location_id: '11111111-1111-1111-1111-111111111101',
      current_plant_id: '22222222-2222-2222-2222-222222222201',
      current_department_id: '33333333-3333-3333-3333-333333333302',
      assigned_employee_id: 'emp-feat-4', // Adesh Kumar
      status: 'in_service',
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    assetCounter++;
  }

  // 4. Adity Kumar (1 Laptop)
  result.push({
    id: `ast-lap-${assetCounter}`,
    asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
    name: 'Dell Vostro 15 3520 Laptop',
    model: 'Vostro 3520',
    category_id: '44444444-4444-4444-4444-444444444401',
    current_location_id: '11111111-1111-1111-1111-111111111101',
    current_plant_id: '22222222-2222-2222-2222-222222222201',
    current_department_id: '33333333-3333-3333-3333-333333333302',
    assigned_employee_id: 'emp-feat-5', // Adity Kumar
    status: 'in_service',
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assetCounter++;

  // 5. Akash Yadav (1 Laptop)
  result.push({
    id: `ast-lap-${assetCounter}`,
    asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
    name: 'HP EliteBook 840 G8 Laptop',
    model: 'EliteBook 840',
    category_id: '44444444-4444-4444-4444-444444444401',
    current_location_id: '11111111-1111-1111-1111-111111111101',
    current_plant_id: '22222222-2222-2222-2222-222222222201',
    current_department_id: '33333333-3333-3333-3333-333333333302',
    assigned_employee_id: 'emp-feat-6', // Akash Yadav
    status: 'in_service',
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assetCounter++;

  // 6. Akshit Kalra (1 Laptop)
  result.push({
    id: `ast-lap-${assetCounter}`,
    asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
    name: 'Lenovo V15 G3 Laptop',
    model: 'V15 G3',
    category_id: '44444444-4444-4444-4444-444444444401',
    current_location_id: '11111111-1111-1111-1111-111111111101',
    current_plant_id: '22222222-2222-2222-2222-222222222201',
    current_department_id: '33333333-3333-3333-3333-333333333302',
    assigned_employee_id: 'emp-feat-7', // Akshit Kalra
    status: 'in_service',
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assetCounter++;

  // Generate remaining assets up to 108
  for (let empIdx = 8; empIdx <= 108; empIdx++) {
    result.push({
      id: `ast-lap-${assetCounter}`,
      asset_tag: `PGEL-LPT-${1000 + assetCounter}`,
      name: `Dell Latitude 3420 Business Laptop`,
      model: 'Latitude 3420',
      category_id: '44444444-4444-4444-4444-444444444401',
      current_location_id: '11111111-1111-1111-1111-111111111101',
      current_plant_id: '22222222-2222-2222-2222-222222222201',
      current_department_id: '33333333-3333-3333-3333-333333333302',
      assigned_employee_id: `emp-gen-${empIdx}`,
      status: 'in_service',
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    assetCounter++;
  }

  return result;
};

const AMC_DAY_OFFSETS = [5, 12, 24, 45, 58, 75, 88, 150, 300, -20, null, null];
const DEMO_COSTS = [58000, 72000, 64500, 91000, 49900, 83500, 67000];
const DEMO_PLANT_IDS = SEED_PLANTS.map((p) => p.id);
const DEMO_DEPT_IDS = SEED_DEPARTMENTS.map((d) => d.id);

export const SEED_ASSETS: Asset[] = generate108Assets().map((asset, i) => {
  const offset = AMC_DAY_OFFSETS[i % AMC_DAY_OFFSETS.length];
  const expiry = new Date();
  if (offset !== null) expiry.setDate(expiry.getDate() + offset);
  const purchased = new Date();
  purchased.setDate(purchased.getDate() - ((i * 53) % 1460));
  return {
    ...asset,
    purchase_date: asset.purchase_date ?? purchased.toISOString().slice(0, 10),
    current_plant_id: DEMO_PLANT_IDS[i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0],
    current_department_id: DEMO_DEPT_IDS[i % DEMO_DEPT_IDS.length],
    purchase_cost: asset.purchase_cost ?? DEMO_COSTS[i % DEMO_COSTS.length],
    amc_expiry: offset === null ? asset.amc_expiry : expiry.toISOString().slice(0, 10),
  };
});

export const SEED_PM_MACHINES: PMMachine[] = [
  {
    id: '66666666-6666-6666-6666-666666666601',
    machine_code: 'MCH-IM-01',
    machine_name: 'Toshiba 450T Injection Molding Press #1',
    plant_id: '22222222-2222-2222-2222-222222222201',
    location_id: '11111111-1111-1111-1111-111111111101',
    department_id: '33333333-3333-3333-3333-333333333302',
    pm_frequency_days: 30,
    last_pm_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString().split('T')[0],
    next_pm_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().split('T')[0],
    qr_code_token: 'mch_token_im01_pgel',
    status: 'operational',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '66666666-6666-6666-6666-666666666602',
    machine_code: 'MCH-AC-04',
    machine_name: 'Atlas Copco 75kW Air Compressor Unit B',
    plant_id: '22222222-2222-2222-2222-222222222202',
    location_id: '11111111-1111-1111-1111-111111111101',
    department_id: '33333333-3333-3333-3333-333333333305',
    pm_frequency_days: 45,
    last_pm_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 50).toISOString().split('T')[0],
    next_pm_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().split('T')[0],
    qr_code_token: 'mch_token_ac04_pgel',
    status: 'breakdown',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '66666666-6666-6666-6666-666666666603',
    machine_code: 'MCH-SMT-02',
    machine_name: 'Yamaha High-Speed SMT Pick & Place',
    plant_id: '22222222-2222-2222-2222-222222222202',
    location_id: '11111111-1111-1111-1111-111111111101',
    department_id: '33333333-3333-3333-3333-333333333302',
    pm_frequency_days: 15,
    last_pm_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString().split('T')[0],
    next_pm_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().split('T')[0],
    qr_code_token: 'mch_token_smt02_pgel',
    status: 'operational',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const SEED_PM_COMPLAINTS: PMComplaint[] = [
  {
    id: 'c001',
    machine_id: '66666666-6666-6666-6666-666666666602',
    reporter_name: 'Mahesh Patil',
    reporter_contact: '+91 98333 44556',
    description: 'Compressor abnormal pressure drop below 5 bar during peak molding cycle.',
    priority: 'high',
    status: 'open',
    ip_address: '192.168.10.15',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    event_category: 'session',
    user_id: '00000000-0000-0000-0000-000000000001',
    user_role: 'it_admin',
    action: 'LOGIN_SUCCESS',
    risk_level: 'normal',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'log-2',
    event_category: 'data_change',
    user_id: '00000000-0000-0000-0000-000000000001',
    user_role: 'it_admin',
    action: 'ASSET_CREATE',
    target_table: 'assets',
    record_id: 'a001',
    changes: { asset_tag: 'PGEL-IT-2024-001', name: 'Lenovo ThinkPad P16 Gen 2' },
    risk_level: 'normal',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: 'log-3',
    event_category: 'session',
    user_id: null,
    user_role: 'anonymous',
    action: 'LOGIN_FAILED_ATTEMPT',
    risk_level: 'warning',
    ip_address: '103.22.45.18',
    user_agent: 'Unknown Bot / Script',
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'log-4',
    event_category: 'session',
    user_id: null,
    user_role: 'anonymous',
    action: 'LOGIN_FAILED_ATTEMPT',
    risk_level: 'warning',
    ip_address: '103.22.45.18',
    user_agent: 'Unknown Bot / Script',
    created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: 'log-5',
    event_category: 'session',
    user_id: null,
    user_role: 'anonymous',
    action: 'LOGIN_FAILED_ATTEMPT_SPIKE',
    risk_level: 'critical',
    ip_address: '103.22.45.18',
    user_agent: 'Unknown Bot / Script',
    created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
];
