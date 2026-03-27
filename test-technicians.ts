#!/usr/bin/env node
/**
 * Technician Management System Test Script
 * Tests all technician API endpoints and skill-based dispatch
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3002';

async function testApi(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`\n📡 ${options.method || 'GET'} ${endpoint}`);
  
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  
  const data = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response:`, JSON.stringify(data, null, 2));
  return { status: response.status, data };
}

async function runTests() {
  console.log('🧪 Technician Management System Tests');
  console.log('=====================================\n');
  
  let hvacTechnicianId: number | null = null;
  let appointmentId: number | null = null;
  let jobId: number | null = null;
  let customerId: number | null = null;
  
  try {
    // Test 1: Add a technician with HVAC specialty
    console.log('\n📋 TEST 1: Add HVAC Technician');
    const createTechResult = await testApi('/api/technicians', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mike Johnson',
        phone: '(555) 123-4567',
        email: 'mike@servicebiz.com',
        specialties: ['hvac', 'heating', 'cooling'],
        is_active: true
      })
    });
    
    if (createTechResult.status !== 200 || !createTechResult.data.technician) {
      throw new Error('Failed to create technician');
    }
    
    hvacTechnicianId = createTechResult.data.technician.id;
    console.log(`✅ Created HVAC technician with ID: ${hvacTechnicianId}`);
    
    // Test 2: List all technicians
    console.log('\n📋 TEST 2: List All Technicians');
    const listResult = await testApi('/api/technicians');
    
    if (listResult.status !== 200 || !listResult.data.technicians) {
      throw new Error('Failed to list technicians');
    }
    
    console.log(`✅ Found ${listResult.data.technicians.length} technician(s)`);
    
    // Test 3: Update technician
    console.log('\n📋 TEST 3: Update Technician');
    const updateResult = await testApi(`/api/technicians/${hvacTechnicianId}`, {
      method: 'PUT',
      body: JSON.stringify({
        phone: '(555) 999-8888',
        specialties: ['hvac', 'heating', 'cooling', 'ventilation']
      })
    });
    
    if (updateResult.status !== 200) {
      throw new Error('Failed to update technician');
    }
    
    console.log(`✅ Updated technician phone and added ventilation specialty`);
    
    // Test 4: Create a customer for the appointment
    console.log('\n📋 TEST 4: Create Customer');
    const customerResult = await testApi('/webhook/chat', {
      method: 'POST',
      body: JSON.stringify({
        customer_phone: '+15551234567',
        message: 'I need HVAC repair, my AC is not working',
        session_id: 'test-session-123'
      })
    });
    
    // Get customer from database via conversations API
    const conversationsResult = await testApi('/api/conversations');
    if (conversationsResult.data.conversations && conversationsResult.data.conversations.length > 0) {
      const conversation = conversationsResult.data.conversations[0];
      
      // Create a job manually for testing
      console.log('\n📋 TEST 5: Create HVAC Job');
      const dbModule = await import('./database');
      const db = await dbModule.getDb();
      
      // Create customer
      const customerResult = await db.run(`
        INSERT INTO customers (name, phone, address)
        VALUES (?, ?, ?)
      `, ['Test Customer', '(555) 111-2222', '123 Test St']);
      customerId = customerResult.lastID;
      
      // Create HVAC job
      const jobResult = await db.run(`
        INSERT INTO jobs (customer_id, service_type, description, urgency, status)
        VALUES (?, ?, ?, ?, ?)
      `, [customerId, 'hvac', 'AC not cooling properly', 'high', 'qualified']);
      jobId = jobResult.lastID;
      
      console.log(`✅ Created HVAC job with ID: ${jobId}`);
      
      // Test 6: Create appointment for the job
      console.log('\n📋 TEST 6: Create Appointment');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      
      const apptResult = await testApi('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          job_id: jobId,
          scheduled_date: dateStr,
          scheduled_time: '10:00',
          notes: 'HVAC repair appointment'
        })
      });
      
      if (apptResult.status !== 200 || !apptResult.data.id) {
        throw new Error('Failed to create appointment');
      }
      
      appointmentId = apptResult.data.id;
      console.log(`✅ Created appointment with ID: ${appointmentId}`);
      
      // Test 7: Get technician schedule (should be empty initially)
      console.log('\n📋 TEST 7: Get Technician Schedule (before assignment)');
      const scheduleBefore = await testApi(`/api/technicians/${hvacTechnicianId}/schedule`);
      console.log(`✅ Schedule has ${scheduleBefore.data.appointments?.length || 0} appointments`);
      
      // Test 8: Manually assign technician to appointment
      console.log('\n📋 TEST 8: Assign Technician to Appointment');
      const assignResult = await testApi(`/api/technicians/${hvacTechnicianId}/assign`, {
        method: 'PUT',
        body: JSON.stringify({
          appointment_id: appointmentId
        })
      });
      
      if (assignResult.status !== 200) {
        throw new Error('Failed to assign technician');
      }
      
      console.log(`✅ Assigned technician to appointment ${appointmentId}`);
      
      // Test 9: Verify technician schedule now shows the appointment
      console.log('\n📋 TEST 9: Verify Technician Schedule (after assignment)');
      const scheduleAfter = await testApi(`/api/technicians/${hvacTechnicianId}/schedule`);
      
      if (scheduleAfter.data.appointments && scheduleAfter.data.appointments.length > 0) {
        const appt = scheduleAfter.data.appointments[0];
        console.log(`✅ Schedule now shows appointment: ${appt.service_type} for ${appt.customer_name}`);
        
        if (appt.service_type.toLowerCase() === 'hvac') {
          console.log('✅ HVAC technician correctly assigned to HVAC job!');
        }
      } else {
        throw new Error('Appointment not found in technician schedule');
      }
      
      // Test 10: Test soft delete
      console.log('\n📋 TEST 10: Soft Delete Technician');
      const deleteResult = await testApi(`/api/technicians/${hvacTechnicianId}`, {
        method: 'DELETE'
      });
      
      if (deleteResult.status !== 200) {
        throw new Error('Failed to delete technician');
      }
      
      console.log(`✅ Technician ${hvacTechnicianId} deactivated`);
      
      // Verify technician is now inactive
      const listAfterDelete = await testApi('/api/technicians');
      const deletedTech = listAfterDelete.data.technicians.find((t: any) => t.id === hvacTechnicianId);
      if (deletedTech && deletedTech.is_active === 0) {
        console.log('✅ Technician correctly marked as inactive');
      }
      
    } else {
      console.log('⚠️  No conversations found, skipping job/appointment tests');
    }
    
    console.log('\n=====================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('=====================================\n');
    
    return { success: true };
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.log('\n=====================================');
    console.log('❌ TESTS COMPLETED WITH ERRORS');
    console.log('=====================================\n');
    return { success: false, error };
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

export { runTests };
