// Test script to validate the client hourly rate calculation
// Formula: Client hourly rate = hourly cost / (1 - Default Margin) * Exchange Rate

function testClientHourlyRateCalculation() {
  // Test case 1: USD client currency (exchange rate = 1.0)
  const hourlyCostUSD = 50; // $50/hour internal cost
  const defaultMargin = 25; // 25% margin
  const exchangeRateUSD = 1.0; // USD to USD
  
  const marginDecimal = defaultMargin / 100; // 0.25
  const clientHourlyRateInUSD = hourlyCostUSD / (1 - marginDecimal); // 50 / 0.75 = 66.67
  const clientHourlyRate = clientHourlyRateInUSD * exchangeRateUSD; // 66.67 * 1.0 = 66.67
  
  console.log('Test 1 - USD Currency:');
  console.log(`Internal cost: $${hourlyCostUSD}/hour`);
  console.log(`Default margin: ${defaultMargin}%`);
  console.log(`Exchange rate: ${exchangeRateUSD}`);
  console.log(`Calculated client rate: $${clientHourlyRate.toFixed(2)}/hour`);
  console.log(`Expected margin: ${((clientHourlyRate - hourlyCostUSD) / clientHourlyRate * 100).toFixed(1)}%`);
  console.log('');
  
  // Test case 2: EUR client currency (exchange rate = 0.89)
  const exchangeRateEUR = 0.89; // USD to EUR
  
  const clientHourlyRateEUR = clientHourlyRateInUSD * exchangeRateEUR; // 66.67 * 0.89 = 59.33
  
  console.log('Test 2 - EUR Currency:');
  console.log(`Internal cost: $${hourlyCostUSD}/hour`);
  console.log(`Default margin: ${defaultMargin}%`);
  console.log(`Exchange rate: ${exchangeRateEUR}`);
  console.log(`Calculated client rate: €${clientHourlyRateEUR.toFixed(2)}/hour`);
  console.log(`Internal cost in EUR: €${(hourlyCostUSD / exchangeRateEUR).toFixed(2)}/hour`);
  console.log(`Expected margin: ${((clientHourlyRateEUR - (hourlyCostUSD / exchangeRateEUR)) / clientHourlyRateEUR * 100).toFixed(1)}%`);
  console.log('');
  
  // Test case 3: GBP client currency (exchange rate = 0.79)
  const exchangeRateGBP = 0.79; // USD to GBP
  
  const clientHourlyRateGBP = clientHourlyRateInUSD * exchangeRateGBP; // 66.67 * 0.79 = 52.67
  
  console.log('Test 3 - GBP Currency:');
  console.log(`Internal cost: $${hourlyCostUSD}/hour`);
  console.log(`Default margin: ${defaultMargin}%`);
  console.log(`Exchange rate: ${exchangeRateGBP}`);
  console.log(`Calculated client rate: £${clientHourlyRateGBP.toFixed(2)}/hour`);
  console.log(`Internal cost in GBP: £${(hourlyCostUSD / exchangeRateGBP).toFixed(2)}/hour`);
  console.log(`Expected margin: ${((clientHourlyRateGBP - (hourlyCostUSD / exchangeRateGBP)) / clientHourlyRateGBP * 100).toFixed(1)}%`);
}

testClientHourlyRateCalculation();
