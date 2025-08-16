// test-simple.js
// Simple test for quick validation of Qwen OpenAI Proxy

const http = require('http');
const { URL } = require('url');

class SimpleTest {
  constructor() {
    this.baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8951';
  }

  async makeRequest(path, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: timeout
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      req.end();
    });
  }

  async runQuickTest() {
    console.log('🚀 Running Simple Qwen Proxy Test');
    console.log(`Base URL: ${this.baseUrl}\n`);

    try {
      // Test 1: Health check
      console.log('🔍 Testing health endpoint...');
      const healthResponse = await this.makeRequest('/health');
      
      if (healthResponse.statusCode === 200) {
        const healthData = JSON.parse(healthResponse.body);
        if (healthData.status === 'ok') {
          console.log('✅ Health check: PASSED');
        } else {
          throw new Error('Health check returned invalid status');
        }
      } else {
        throw new Error(`Health check failed with status: ${healthResponse.statusCode}`);
      }

      // Test 2: Dashboard access
      console.log('🔍 Testing dashboard access...');
      const dashboardResponse = await this.makeRequest('/dashboard/');
      
      if (dashboardResponse.statusCode === 200) {
        if (dashboardResponse.body.includes('Qwen Proxy Dashboard')) {
          console.log('✅ Dashboard access: PASSED');
        } else {
          throw new Error('Dashboard page missing expected content');
        }
      } else {
        throw new Error(`Dashboard access failed with status: ${dashboardResponse.statusCode}`);
      }

      // Test 3: API endpoint behavior
      console.log('🔍 Testing API authentication...');
      const apiResponse = await this.makeRequest('/api/keys');
      
      if (apiResponse.statusCode === 401) {
        try {
          const apiData = JSON.parse(apiResponse.body);
          if (apiData.success === false && apiData.error) {
            console.log('✅ API authentication: PASSED');
          } else {
            throw new Error('API returned unexpected response format');
          }
        } catch (parseError) {
          throw new Error('API response is not valid JSON');
        }
      } else {
        throw new Error(`API endpoint returned unexpected status: ${apiResponse.statusCode}`);
      }

      console.log('\n🎉 All simple tests PASSED!');
      console.log('✨ Qwen OpenAI Proxy is working correctly');
      return true;

    } catch (error) {
      console.log(`\n❌ Test FAILED: ${error.message}`);
      console.log('💡 Make sure the server is running: npm start');
      return false;
    }
  }
}

// Check if server is accessible
async function checkServer(baseUrl) {
  try {
    const test = new SimpleTest();
    await test.makeRequest('/health', 2000);
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const test = new SimpleTest();
  
  console.log('⏳ Checking server availability...');
  const isRunning = await checkServer(test.baseUrl);
  
  if (!isRunning) {
    console.log('❌ Server is not accessible');
    console.log(`   Expected at: ${test.baseUrl}`);
    console.log('   Start server: npm start');
    process.exit(1);
  }

  const success = await test.runQuickTest();
  process.exit(success ? 0 : 1);
}

// Error handling
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled error:', reason.message);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  });
}

module.exports = SimpleTest;