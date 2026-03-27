const { getDb } = require('./dist/database.js');

async function clearState(phone) {
  const db = await getDb();
  
  // Get customer
  const customer = await db.get('SELECT id FROM customers WHERE phone = ?', phone);
  if (!customer) {
    console.log('Customer not found');
    return;
  }
  
  // Clear conversation state
  await db.run('DELETE FROM conversation_states WHERE customer_id = ?', customer.id);
  
  // Update jobs to completed/cancelled so they don't interfere
  await db.run("UPDATE jobs SET status = 'completed' WHERE customer_id = ? AND status IN ('new', 'scheduled')", customer.id);
  
  console.log('State cleared for', phone);
}

clearState('+14052096531').then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
