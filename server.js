const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// In-memory database (works on Vercel/serverless)
// Note: Data will be lost on server restart. For production, use MongoDB/PostgreSQL
let usersDB = { users: [] };

// KFintech API endpoints
const KFINTECH_BASE_URL = 'https://ipostatus.kfintech.com';
const KFINTECH_API_URL = 'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query';
const CLIENT_ID = '25353949930';

// Fetch list of companies with active IPOs from KFintech JS file
app.get('/api/companies', async (req, res) => {
  try {
    console.log('Fetching companies from KFintech...');
    
    // Fetch the main JavaScript file that contains company data
    const response = await axios.get(`${KFINTECH_BASE_URL}/static/js/main.0ec4c140.js`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Referer': 'https://ipostatus.kfintech.com/',
        'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'script',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin'
      }
    });
    
    console.log('Received JavaScript file, parsing...');
    const jsContent = response.data;
    
    // Extract company data from the JavaScript file
    // Looking for JSON array with format: [{"clientId":"XXX","name":"Company Name"}]
    const companies = [];
    
    // Pattern to find JSON array with clientId and name
    const jsonArrayPattern = /JSON\.parse\('(\[.*?\{"clientId".*?\}.*?\])'\)/gs;
    const match = jsonArrayPattern.exec(jsContent);
    
    if (match) {
      try {
        // Parse the found JSON string
        const jsonString = match[1].replace(/\\/g, ''); // Remove escape characters
        const companyData = JSON.parse(jsonString);
        
        console.log(`Parsed JSON array with ${companyData.length} entries`);
        
        // Convert to our format
        companyData.forEach(item => {
          if (item.clientId && item.name) {
            companies.push({
              value: item.clientId,
              name: item.name
            });
          }
        });
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError.message);
      }
    }
    
    // Alternative: Look for direct JSON array pattern
    if (companies.length === 0) {
      const directPattern = /\[{.*?"clientId"\s*:\s*"([^"]+)".*?"name"\s*:\s*"([^"]+)".*?}\]/gs;
      const arrayMatch = directPattern.exec(jsContent);
      
      if (arrayMatch) {
        // Extract all clientId and name pairs
        const itemPattern = /\{"clientId"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"\}/g;
        let itemMatch;
        
        while ((itemMatch = itemPattern.exec(jsContent)) !== null) {
          companies.push({
            value: itemMatch[1],
            name: itemMatch[2]
          });
        }
      }
    }
    
    // Remove duplicates
    const uniqueCompanies = Array.from(
      new Map(companies.map(item => [item.value, item])).values()
    );
    
    console.log(`\n✅ Found ${uniqueCompanies.length} companies:\n`);
    uniqueCompanies.forEach((company, index) => {
      console.log(`${index + 1}. Code: "${company.value}" | Name: "${company.name}"`);
    });
    console.log('\n');
    
    res.json({ 
      success: true, 
      companies: uniqueCompanies,
      count: uniqueCompanies.length 
    });
    
  } catch (error) {
    console.error('Error fetching companies:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch companies from KFintech',
      error: error.message 
    });
  }
});

// Check IPO allotment status using KFintech API
app.post('/api/check-allotment', async (req, res) => {
  try {
    const { company, pan, applicationType, clientId } = req.body;
    
    // Use clientId (issueCode) from selected company
    const issueCode = clientId || company;
    
    console.log('\n📋 Checking allotment:');
    console.log('  Issue Code (clientId):', issueCode);
    console.log('  PAN:', pan?.substring(0, 3) + '***');
    console.log('  Application Type:', applicationType);
    
    if (!pan) {
      return res.status(400).json({ 
        success: false, 
        message: 'PAN/Application Number is required' 
      });
    }

    if (!issueCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company/Issue Code is required' 
      });
    }

    // Determine the query type based on application type
    let queryType = 'pan';
    if (applicationType === 'APP_NO') {
      queryType = 'appno';
    } else if (applicationType === 'DP_CLIENT') {
      queryType = 'dpclient';
    }

    console.log('  Query Type:', queryType);
    console.log('  API URL:', `${KFINTECH_API_URL}?type=${queryType}`);

    // Make request to KFintech API with issueCode (clientId) and PAN
    const response = await axios.get(
      `${KFINTECH_API_URL}?type=${queryType}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-IN,en;q=0.9',
          'access-control-allow-origin': '*',
          'client_id': issueCode,  // Use the selected company's clientId
          'reqparam': pan.toUpperCase(),
          'Origin': KFINTECH_BASE_URL,
          'Referer': `${KFINTECH_BASE_URL}/`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Linux"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site'
        }
      }
    );

    console.log('✅ KFintech API response received');
    console.log('   Status:', response.status);
    console.log('   Data:', JSON.stringify(response.data).substring(0, 200));
    console.log('\n');
    
    // Parse the response
    const result = response.data;
    
    res.json({ 
      success: true, 
      data: result,
      message: 'Allotment status fetched successfully'
    });
    
  } catch (error) {
    console.error('❌ Error checking allotment:', error.message);
    
    // Check if it's a 404 or no records found
    if (error.response?.status === 404) {
      console.log('   No records found (404)\n');
      res.json({
        success: true,
        data: { found: false, message: 'No records found for this PAN' },
        message: 'No allotment records found'
      });
    } else {
      console.log('   Error details:', error.response?.data || error.message);
      console.log('\n');
      res.status(500).json({ 
        success: false, 
        message: 'Failed to check allotment status',
        error: error.message 
      });
    }
  }
});

// Helper functions for user database (in-memory storage)
// Works on Vercel/serverless platforms with read-only file system
async function readUsersDB() {
  return usersDB;
}

async function writeUsersDB(data) {
  usersDB = data;
}

// Register new user
app.post('/api/user/register', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    const db = await readUsersDB();
    
    // Check if user already exists
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
      return res.json({
        success: true,
        user: existingUser,
        message: 'User already exists'
      });
    }

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      phone: phone || '',
      panCards: [],
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    await writeUsersDB(db);

    console.log(`✅ New user registered: ${name} (${email})`);

    res.json({
      success: true,
      user: newUser,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: error.message
    });
  }
});

// Add PAN card to user
app.post('/api/user/add-pan', async (req, res) => {
  try {
    const { userId, panNumber, holderName } = req.body;
    
    if (!userId || !panNumber) {
      return res.status(400).json({
        success: false,
        message: 'User ID and PAN number are required'
      });
    }

    const db = await readUsersDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if PAN already exists for this user
    const existingPan = user.panCards.find(p => p.panNumber === panNumber.toUpperCase());
    if (existingPan) {
      return res.json({
        success: true,
        user: user,
        message: 'PAN card already added'
      });
    }

    // Add new PAN card
    user.panCards.push({
      panNumber: panNumber.toUpperCase(),
      holderName: holderName || '',
      addedAt: new Date().toISOString()
    });

    await writeUsersDB(db);

    console.log(`✅ PAN added for user ${user.name}: ${panNumber.toUpperCase()}`);

    res.json({
      success: true,
      user: user,
      message: 'PAN card added successfully'
    });
  } catch (error) {
    console.error('Error adding PAN:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add PAN card',
      error: error.message
    });
  }
});

// Get user details
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await readUsersDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Check allotment for all PANs of a user
app.post('/api/check-allotment-bulk', async (req, res) => {
  try {
    const { userId, clientId, companyName } = req.body;
    
    console.log('\n📋 Bulk Allotment Check:');
    console.log('  User ID:', userId);
    console.log('  Issue Code (clientId):', clientId);
    console.log('  Company:', companyName);

    if (!userId || !clientId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Company clientId are required'
      });
    }

    // Get user and their PAN cards
    const db = await readUsersDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.panCards.length === 0) {
      return res.json({
        success: true,
        results: [],
        message: 'No PAN cards added for this user'
      });
    }

    console.log(`  Checking ${user.panCards.length} PAN cards...`);

    // Check allotment for each PAN card
    const results = [];
    
    for (const panCard of user.panCards) {
      try {
        console.log(`  → Checking PAN: ${panCard.panNumber}`);
        
        const response = await axios.get(
          `${KFINTECH_API_URL}?type=pan`,
          {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-IN,en;q=0.9',
              'access-control-allow-origin': '*',
              'client_id': clientId,
              'reqparam': panCard.panNumber,
              'Origin': KFINTECH_BASE_URL,
              'Referer': `${KFINTECH_BASE_URL}/`,
              'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
              'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Linux"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'cross-site'
            },
            timeout: 10000
          }
        );

        const allotmentData = response.data?.data?.[0] || null;
        const shares = allotmentData?.All_Shares || allotmentData?.App_Shares || 0;
        const isAllotted = parseInt(shares) > 0;

        results.push({
          panNumber: panCard.panNumber,
          holderName: panCard.holderName || allotmentData?.Name || '',
          isAllotted: isAllotted,
          shares: shares,
          data: allotmentData,
          status: 'success'
        });

        console.log(`    ${isAllotted ? '✅ Allotted' : '❌ Not Allotted'} - ${shares} shares`);

      } catch (error) {
        console.log(`    ⚠️ Error or No records`);
        
        results.push({
          panNumber: panCard.panNumber,
          holderName: panCard.holderName,
          isAllotted: false,
          shares: 0,
          data: null,
          status: 'not_found',
          error: error.response?.status === 404 ? 'No records found' : error.message
        });
      }
    }

    console.log(`✅ Bulk check completed: ${results.filter(r => r.isAllotted).length} allotted out of ${results.length}\n`);

    res.json({
      success: true,
      results: results,
      summary: {
        total: results.length,
        allotted: results.filter(r => r.isAllotted).length,
        notAllotted: results.filter(r => !r.isAllotted).length
      },
      message: 'Bulk allotment check completed'
    });

  } catch (error) {
    console.error('❌ Error in bulk check:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check allotments',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 IPO Allotment Checker Server (KFintech API)`);
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}`);
  console.log(`Status: Ready to accept requests\n`);
});