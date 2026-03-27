import { createAppointmentEvent } from './google-calendar';

async function testCreateEvent() {
  try {
    const result = await createAppointmentEvent('default', {
      customerName: 'Test Customer',
      customerPhone: '(555) 111-2222',
      serviceType: 'hvac',
      description: 'AC not cooling properly',
      date: '2026-03-21',
      time: '10:00',
      address: '123 Test St',
      technicianName: 'Mike Johnson'
    });
    console.log('Event created:', result);
  } catch (err) {
    console.error('Error creating event:', err);
  }
}

testCreateEvent();
