// test-proxy.js
// Comprehensive test suite for Qwen OpenAI Proxy

const http = require('http');
const https = require('https');
const { URL } = require('url');

class ProxyTester {
  constructor() {
    this.baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8951';
    this.testResults = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runAllTests() {
    console.log('🚀 Starting Qwen OpenAI Proxy Test Suite\n');
    console.log(`Base URL: ${this.baseUrl}\n`);

    const tests = [
      { name: 'Health Check', test: () => this.testHealthCheck() },
      { name: 'Models Endpoint', test: () => this.testModelsEndpoint() },
      { name: 'Dashboard Access', test: () => this.testDashboardAccess() },
      { name: 'Dashboard Login Page', test: () => this.testDashboardLogin() },
      { name: 'Dashboard Setup Page', test: () => this.testDashboardSetup() },
      { name: 'API Authentication', test: () => this.testApiAuthentication() },
      { name: 'Static Assets', test: () => this.testStaticAssets() }
    ];

    for (const testCase of tests) {
      try {
        console.log(`\n🧪 Running: ${testCase.name}`);
        await testCase.test();
        this.recordTest(testCase.name, true);
      } catch (error) {
        this.recordTest(testCase.name, false, error.message);
      }
    }

    this.printResults();
    process.exit(this.failedTests > 0 ? 1 : 0);
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const requestModule = url.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Qwen-Proxy-Tester/1.0',
          ...options.headers
        },
        timeout: options.timeout || 5000
      };

      const req = requestModule.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  async testHealthCheck() {
    const response = await this.makeRequest('/health');
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    if (data.status !== 'ok') {
      throw new Error(`Expected status 'ok', got '${data.status}'`);
    }

    console.log('✅ Health check passed');
  }

  async testModelsEndpoint() {
    const response = await this.makeRequest('/v1/models');
    
    // This might return 401 if not authenticated, which is expected
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Models endpoint should return data array');
      }
      console.log('✅ Models endpoint accessible and returns valid data');
    } else if (response.statusCode === 401) {
      console.log('✅ Models endpoint properly requires authentication');
    } else {
      throw new Error(`Unexpected status code: ${response.statusCode}`);
    }
  }

  async testDashboardAccess() {
    const response = await this.makeRequest('/dashboard/');
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    if (!response.body.includes('Qwen Proxy Dashboard')) {
      throw new Error('Dashboard page does not contain expected title');
    }

    console.log('✅ Dashboard main page accessible');
  }

  async testDashboardLogin() {
    const response = await this.makeRequest('/dashboard/login');
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    if (!response.body.includes('login') || !response.body.includes('password')) {
      throw new Error('Login page does not contain expected form elements');
    }

    console.log('✅ Dashboard login page accessible');
  }

  async testDashboardSetup() {
    const response = await this.makeRequest('/dashboard/setup');
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    if (!response.body.includes('Setup') || !response.body.includes('Qwen')) {
      throw new Error('Setup page does not contain expected content');
    }

    console.log('✅ Dashboard setup page accessible');
  }

  async testApiAuthentication() {
    const response = await this.makeRequest('/api/keys');
    
    if (response.statusCode !== 401) {
      throw new Error(`Expected status 401 (unauthorized), got ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    if (!data.error) {
      throw new Error('Unauthorized request should return error object');
    }

    console.log('✅ API properly requires authentication');
  }

  async testStaticAssets() {
    const response = await this.makeRequest('/dashboard/style.css');
    
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200 for CSS, got ${response.statusCode}`);
    }

    if (!response.headers['content-type'] || !response.headers['content-type'].includes('text/css')) {
      throw new Error('CSS file does not have correct content-type');
    }

    console.log('✅ Static assets served correctly');
  }

  recordTest(name, passed, error = null) {
    this.testResults.push({ name, passed, error });
    if (passed) {
      this.passedTests++;
    } else {
      this.failedTests++;
      console.log(`❌ ${name}: ${error}`);
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(`📋 Total:  ${this.testResults.length}`);
    
    if (this.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(result => !result.passed)
        .forEach(result => {
          console.log(`  • ${result.name}: ${result.error}`);
        });
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (this.failedTests === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️  Some tests failed. Check the output above.');
    }
  }
}

// Check if server is running
async function checkServerRunning(baseUrl) {
  try {
    const tester = new ProxyTester();
    await tester.makeRequest('/health');
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const tester = new ProxyTester();
  
  console.log('🔍 Checking if server is running...');
  const isRunning = await checkServerRunning(tester.baseUrl);
  
  if (!isRunning) {
    console.log('❌ Server is not running or not accessible');
    console.log(`   Expected server at: ${tester.baseUrl}`);
    console.log('   Please start the server with: npm start');
    process.exit(1);
  }
  
  console.log('✅ Server is running');
  await tester.runAllTests();
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner error:', error);
    process.exit(1);
  });
}

module.exports = ProxyTester;