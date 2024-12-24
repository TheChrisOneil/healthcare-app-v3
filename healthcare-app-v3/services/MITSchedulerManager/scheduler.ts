/**
* Comprehensive Appointment Scheduling System
*
* Original Requirements:
* 1. "I'm scheduling some appointments for Patient 123456, could you find any existing
*     appointments and try to schedule these so that the Patient has several a day,
*     to minimize travel time?"
*
* 2. "I want to schedule you for a series of 5 NeuroPlasticity Scans over two weeks,
*     starting next Wednesday (never more than 3 per week). And I'd also like to schedule
*     you for a series of 4 Heavy Metal Detox IVs starting today if possible, at two per
*     week and never more than 2 per week. And I'd like to schedule you for a sleep study
*     at Dr. Mani's clinic as soon as possible. Oh, and let's get you started on a series
*     of 8 multivitamin IVs at 2 per week, starting after your second Heavy Metal
*     Detox treatments."
*
* This system handles:
* - Finding and leveraging existing appointments for clustering
* - Single appointments
* - Multiple same-day appointments
* - Recurring series with constraints
* - Dependencies between series
* - Optimization for patient convenience
*
* FUTURE ENHANCEMENTS (v2+):
* 1. Time Preferences:
*    - Preferred/excluded time ranges
*    - Day of week preferences
* 2. Special Requirements:
*    - Equipment needs
*    - Accessibility requirements
*    - Patient preparation (fasting, lab work)
* 3. Insurance/Administrative:
*    - Pre-authorization
*    - Visit limits
* 4. Patient Preferences:
*    - Location preferences
*    - Transportation needs
*    - Group vs individual
*/


/**
* Comprehensive enum of all appointment types offered by the clinic.
* This would typically be synchronized with clinic's service catalog.
*/
enum AppointmentTypeCd {
   NEUROPLASTICITY_SCAN = 'NEUROPLASTICITY_SCAN',
   HEAVY_METAL_DETOX_IV = 'HEAVY_METAL_DETOX_IV',
   SLEEP_STUDY = 'SLEEP_STUDY',
   MULTIVITAMIN_IV = 'MULTIVITAMIN_IV',
   PRIMARY_CARE_VISIT = 'PRIMARY_CARE_VISIT',
   RADIATION_THERAPY = 'RADIATION_THERAPY',
   PHYSICAL_THERAPY = 'PHYSICAL_THERAPY',
   THERAPY_INITIAL = 'THERAPY_INITIAL',
   THERAPY_FOLLOWUP = 'THERAPY_FOLLOWUP'
}


/**
* Represents an existing appointment in the system.
* Used for finding clustering opportunities.
*/
interface ExistingAppointment {
   appointmentId: string;
   patientDID: string;
   clinicDID: string;
   startTime: Date;
   endTime: Date;
   appointmentTypeCd: AppointmentTypeCd;
   providerIdentifier: {
       clinicianDID?: string;
       resourceDID?: string;
   };
}


/**
* Defines how appointments should be clustered to optimize patient convenience.
* All fields are required to ensure consistent clustering behavior.
*/
interface ClusteringPreference {
   preferClustering: boolean;           // Whether to attempt clustering at all
   preferExistingDays: boolean;         // Whether to prioritize days with existing appointments
   maxAppointmentsPerDay: number;       // Maximum number of appointments allowed per day
   minTimeBetweenAppointments: number;  // Minimum minutes required between appointments
   maxTimeBetweenAppointments: number;  // Maximum minutes allowed between first and last appointment of day
}


/**
* Defines the frequency and constraints for a series of recurring appointments.
* Example: "5 scans over two weeks, never more than 3 per week"
*/
interface RecurringPattern {
   totalOccurrences: number;         // Total appointments in series
   maxPerWeek: number;               // Maximum weekly appointments
   preferredPerWeek?: number;        // Desired appointments per week
   startDate?: Date;                 // Preferred start date
   startAfterSeriesId?: string;      // Dependency on another series
   startAfterOccurrence?: number;    // Start after specific occurrence
}


/**
* Core interface representing a requested appointment or series.
* Handles both single appointments and recurring series.
*/
interface AppointmentRequest {
   seriesId: string;
   sequence?: number;                // For same-day ordering
   providerIdentifier: {
       clinicianDID?: string;        // Specific provider
       resourceDID?: string;         // Or specific resource (e.g., IV suite)
   };
   appointmentTypeCd: AppointmentTypeCd;
   durationMinutes: number;
   recurringPattern?: RecurringPattern;
}


/**
* Main request interface combining all scheduling capabilities.
*/
interface FindAvailableAppointmentsRequest {
   clinicDID: string;
   patientDID: string;
   requestingClinicianDID: string;   // Provider making the request
   requestDate: Date;
   appointmentPreference: {
       specificDate?: Date;
       daysFromNow?: number;
   };
   maxDaysToSearch: number;
   clusteringPreference: ClusteringPreference;
   appointments: AppointmentRequest[];
}


/**
* Represents a scheduled time slot.
* Used in both single appointments and series.
*/
interface AppointmentSlot {
   seriesId: string;
   occurrence?: number;              // Which occurrence in series (1-based)
   providerIdentifier: {
       clinicianDID?: string;
       resourceDID?: string;
   };
   appointmentTypeCd: AppointmentTypeCd;
   startTime: Date;
   durationMinutes: number;
   isReserved: boolean;
}


/**
* Main response interface showing scheduling results.
*/
interface FindAvailableAppointmentsResponse {
   clinicDID: string;
   series: {
       seriesId: string;
       appointments: AppointmentSlot[];
       completionStatus: 'FULLY_SCHEDULED' | 'PARTIALLY_SCHEDULED' | 'CANNOT_SCHEDULE';
       message?: string;
   }[];
   success: boolean;
   reservationDetails?: {
       patientDID: string;
       requestDate: Date;
       requestingClinicianDID: string;
       appointments: {
           startDateTime: Date;
           endDateTime: Date;
           durationMinutes: number;
           appointmentTypeCd: AppointmentTypeCd;
           providerIdentifier: {
               clinicianDID?: string;
               resourceDID?: string;
           };
       }[];
   };
}
/**
* Advanced implementation of the appointment scheduling system.
* Combines clustering optimization with series handling.
*/
class AdvancedAppointmentService {
   async findAndReserveAppointments(
       request: FindAvailableAppointmentsRequest
   ): Promise<FindAvailableAppointmentsResponse> {
       try {
           // 1. Find existing appointments for clustering opportunities
           const existingAppointments = await this.findExistingAppointments(
               request.patientDID,
               request.clinicDID,
               request.requestDate,
               this.calculateEndDate(request)
           );


           // 2. Group existing appointments by date
           const existingAppointmentsByDate = this.groupAppointmentsByDate(existingAppointments);


           // 3. Process recurring series and their dependencies
           const seriesSchedule = await this.processSeriesWithDependencies(
               request.appointments,
               existingAppointmentsByDate,
               request.clusteringPreference
           );


           // 4. Find and optimize slots for all appointments
           const optimizedSlots = await this.findOptimizedSlots(
               request,
               seriesSchedule,
               existingAppointmentsByDate
           );


           if (!optimizedSlots) {
               return this.createErrorResponse(request, "No suitable slots found");
           }


           // 5. Reserve the optimized slots
           const reservedSlots = await this.reserveSlots(optimizedSlots, {
               patientDID: request.patientDID,
               requestDate: request.requestDate,
               requestingClinicianDID: request.requestingClinicianDID
           });


           // 6. Create success response
           return this.createSuccessResponse(request, reservedSlots);
       } catch (error) {
           return this.createErrorResponse(request, error.message);
       }
   }


   private calculateEndDate(request: FindAvailableAppointmentsRequest): Date {
       return new Date(request.requestDate.getTime() +
           request.maxDaysToSearch * 24 * 60 * 60 * 1000);
   }


   /**
    * PLACEHOLDER METHOD - REQUIRES IMPLEMENTATION
    * This method needs to be implemented to interact with your actual appointment database.
    * It should:
    * 1. Query your database for all existing appointments for this patient
    * 2. Apply any necessary filtering based on date range
    * 3. Handle any database connection errors
    * 4. Apply any necessary security/privacy filters
    * 5. Return properly formatted ExistingAppointment objects
    */
   private async findExistingAppointments(
       patientDID: string,
       clinicDID: string,
       startDate: Date,
       endDate: Date
   ): Promise<ExistingAppointment[]> {
       // TODO: Replace this placeholder with actual database query implementation
       return [];
   }


   private async processSeriesWithDependencies(
       appointments: AppointmentRequest[],
       existingAppointments: Map<string, ExistingAppointment[]>,
       clusteringPreference: ClusteringPreference
   ): Promise<Map<string, AppointmentSlot[]>> {
       // Implementation for processing series with dependencies
       return new Map();
   }


   private async findOptimizedSlots(
       request: FindAvailableAppointmentsRequest,
       seriesSchedule: Map<string, AppointmentSlot[]>,
       existingAppointments: Map<string, ExistingAppointment[]>
   ): Promise<AppointmentSlot[] | null> {
       // Implementation for finding optimized slots
       return null;
   }


   private groupAppointmentsByDate(
       appointments: ExistingAppointment[]
   ): Map<string, ExistingAppointment[]> {
       const groupedAppointments = new Map<string, ExistingAppointment[]>();
      
       appointments.forEach(appointment => {
           const dateKey = appointment.startTime.toISOString().split('T')[0];
           if (!groupedAppointments.has(dateKey)) {
               groupedAppointments.set(dateKey, []);
           }
           groupedAppointments.get(dateKey)?.push(appointment);
       });
      
       return groupedAppointments;
   }


   private createErrorResponse(
       request: FindAvailableAppointmentsRequest,
       errorMessage: string
   ): FindAvailableAppointmentsResponse {
       return {
           clinicDID: request.clinicDID,
           series: [{
               seriesId: "ERROR",
               appointments: [],
               completionStatus: "CANNOT_SCHEDULE",
               message: errorMessage
           }],
           success: false
       };
   }


   private createSuccessResponse(
       request: FindAvailableAppointmentsRequest,
       reservedSlots: AppointmentSlot[]
   ): FindAvailableAppointmentsResponse {
       return {
           clinicDID: request.clinicDID,
           series: [{
               seriesId: "SUCCESS",
               appointments: reservedSlots,
               completionStatus: "FULLY_SCHEDULED",
               message: "Successfully scheduled appointments"
           }],
           success: true,
           reservationDetails: {
               patientDID: request.patientDID,
               requestDate: request.requestDate,
               requestingClinicianDID: request.requestingClinicianDID,
               appointments: reservedSlots.map(slot => ({
                   startDateTime: slot.startTime,
                   endDateTime: new Date(slot.startTime.getTime() +
                       slot.durationMinutes * 60 * 1000),
                   durationMinutes: slot.durationMinutes,
                   appointmentTypeCd: slot.appointmentTypeCd,
                   providerIdentifier: slot.providerIdentifier
               }))
           }
       };
   }


   /**
    * PLACEHOLDER METHOD - REQUIRES IMPLEMENTATION
    * This method needs to be implemented to handle actual appointment reservations.
    * It should:
    * 1. Begin a database transaction
    * 2. Lock the relevant time slots
    * 3. Verify slots are still available
    * 4. Create appointment records in your database
    * 5. Commit the transaction
    * 6. Handle any errors and rollback if necessary
    * 7. Send any necessary notifications
    * 8. Update any relevant scheduling caches
    */
   private async reserveSlots(
       slots: AppointmentSlot[],
       reservationInfo: {
           patientDID: string;
           requestDate: Date;
           requestingClinicianDID: string;
       }
   ): Promise<AppointmentSlot[]> {
       // TODO: Replace this placeholder with actual reservation implementation
       return slots.map(slot => ({
           ...slot,
           isReserved: true
       }));
   }
}
// ============= COMPREHENSIVE EXAMPLES =============


// SECTION 1: Basic Appointment Requests
// Example of a simple single appointment request
const singleAppointmentRequest: FindAvailableAppointmentsRequest = {
   clinicDID: "CLINIC123",
   patientDID: "PATIENT456",
   requestingClinicianDID: "DOCTOR999",
   requestDate: new Date("2024-12-23"),
   appointmentPreference: {
       daysFromNow: 7
   },
   maxDaysToSearch: 30,
   clusteringPreference: {
       preferClustering: false,
       preferExistingDays: false,
       maxAppointmentsPerDay: 1,
       minTimeBetweenAppointments: 30,
       maxTimeBetweenAppointments: 480  // 8 hours max spread
   },
   appointments: [
       {
           seriesId: "BASIC_CONSULT",
           sequence: 0,  // Sequence doesn't matter for single appointment
           appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
           providerIdentifier: { clinicianDID: "DOCTOR789" },
           durationMinutes: 30
       }
   ]
};


// Example of multiple same-day appointments
const sameDayRequest: FindAvailableAppointmentsRequest = {
   clinicDID: "CLINIC123",
   patientDID: "PATIENT456",
   requestingClinicianDID: "DOCTOR789",
   requestDate: new Date(),
   appointmentPreference: {
       specificDate: new Date(),  // Want these appointments today
       daysFromNow: 0
   },
   maxDaysToSearch: 30,
   clusteringPreference: {
       preferClustering: true,
       preferExistingDays: true,
       maxAppointmentsPerDay: 3,
       minTimeBetweenAppointments: 30,
       maxTimeBetweenAppointments: 240  // 4 hours max spread
   },
   appointments: [
       {
           seriesId: "MORNING_CONSULT",
           sequence: 1,  // First appointment of the day
           appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
           providerIdentifier: { clinicianDID: "DOCTOR789" },
           durationMinutes: 30
       },
       {
           seriesId: "AFTERNOON_IV",
           sequence: 2,  // Second appointment of the day
           appointmentTypeCd: AppointmentTypeCd.MULTIVITAMIN_IV,
           providerIdentifier: { resourceDID: "IVSUITE001" },
           durationMinutes: 120
       }
   ]
};


// SECTION 2: Complex Series Requests
// Example of multiple recurring series with dependencies
const complexSeriesRequest: FindAvailableAppointmentsRequest = {
   clinicDID: "CLINIC123",
   patientDID: "PATIENT456",
   requestingClinicianDID: "DOCTOR789",
   requestDate: new Date("2024-12-23"),
   appointmentPreference: {
       daysFromNow: 7
   },
   maxDaysToSearch: 30,
   clusteringPreference: {
       preferClustering: true,
       preferExistingDays: true,
       maxAppointmentsPerDay: 3,
       minTimeBetweenAppointments: 30,
       maxTimeBetweenAppointments: 240
   },
   appointments: [
       {
           // NeuroPlasticity Scan Series
           seriesId: "NEURO_SERIES",
           appointmentTypeCd: AppointmentTypeCd.NEUROPLASTICITY_SCAN,
           providerIdentifier: { resourceDID: "NEUROSCAN001" },
           durationMinutes: 60,
           recurringPattern: {
               totalOccurrences: 5,
               maxPerWeek: 3,
               preferredPerWeek: 2,
               startDate: new Date("2024-12-30")
           }
       },
       {
           // Heavy Metal Detox Series
           seriesId: "DETOX_SERIES",
           appointmentTypeCd: AppointmentTypeCd.HEAVY_METAL_DETOX_IV,
           providerIdentifier: { resourceDID: "IVSUITE001" },
           durationMinutes: 120,
           recurringPattern: {
               totalOccurrences: 4,
               maxPerWeek: 2,
               preferredPerWeek: 2
           }
       },
       {
           // Single Sleep Study
           seriesId: "SLEEP_STUDY",
           appointmentTypeCd: AppointmentTypeCd.SLEEP_STUDY,
           providerIdentifier: { clinicianDID: "DRMANI001" },
           durationMinutes: 480
       },
       {
           // Dependent Multivitamin Series
           seriesId: "MULTIVIT_SERIES",
           appointmentTypeCd: AppointmentTypeCd.MULTIVITAMIN_IV,
           providerIdentifier: { resourceDID: "IVSUITE001" },
           durationMinutes: 60,
           recurringPattern: {
               totalOccurrences: 8,
               maxPerWeek: 2,
               preferredPerWeek: 2,
               startAfterSeriesId: "DETOX_SERIES",
               startAfterOccurrence: 2
           }
       }
   ]
};


// SECTION 3: Clustering with Existing Appointments
// Example of existing appointments in the system
const existingAppointments: ExistingAppointment[] = [
   {
       appointmentId: "EXIST001",
       patientDID: "PATIENT456",
       clinicDID: "CLINIC123",
       startTime: new Date("2024-12-30T10:00:00"),
       endTime: new Date("2024-12-30T11:00:00"),
       appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
       providerIdentifier: { clinicianDID: "DOCTOR789" }
   },
   {
       appointmentId: "EXIST002",
       patientDID: "PATIENT456",
       clinicDID: "CLINIC123",
       startTime: new Date("2025-01-15T14:00:00"),
       endTime: new Date("2025-01-15T15:00:00"),
       appointmentTypeCd: AppointmentTypeCd.NEUROPLASTICITY_SCAN,
       providerIdentifier: { resourceDID: "NEUROSCAN001" }
   }
];


// SECTION 4: Success Responses
// Example of successful clustering response
const successfulClusteringResponse: FindAvailableAppointmentsResponse = {
   clinicDID: "CLINIC123",
   series: [
       {
           seriesId: "CLUSTERED_DAY_1",
           appointments: [
               {
                   // Existing appointment
                   seriesId: "EXISTING_APPT",
                   occurrence: 1,
                   providerIdentifier: { clinicianDID: "DOCTOR789" },
                   appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
                   startTime: new Date("2024-12-30T10:00:00"),
                   durationMinutes: 60,
                   isReserved: true
               },
               {
                   // New appointment clustered same day
                   seriesId: "NEW_IV_SERIES",
                   occurrence: 1,
                   providerIdentifier: { resourceDID: "IVSUITE001" },
                   appointmentTypeCd: AppointmentTypeCd.MULTIVITAMIN_IV,
                   startTime: new Date("2024-12-30T13:00:00"),
                   durationMinutes: 120,
                   isReserved: true
               }
           ],
           completionStatus: "FULLY_SCHEDULED",
           message: "Successfully clustered with existing appointment"
       }
   ],
   success: true,
   reservationDetails: {
       patientDID: "PATIENT456",
       requestDate: new Date("2024-12-23"),
       requestingClinicianDID: "DOCTOR789",
       appointments: [
           {
               startDateTime: new Date("2024-12-30T10:00:00"),
               endDateTime: new Date("2024-12-30T11:00:00"),
               durationMinutes: 60,
               appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
               providerIdentifier: { clinicianDID: "DOCTOR789" }
           },
           {
               startDateTime: new Date("2024-12-30T13:00:00"),
               endDateTime: new Date("2024-12-30T15:00:00"),
               durationMinutes: 120,
               appointmentTypeCd: AppointmentTypeCd.MULTIVITAMIN_IV,
               providerIdentifier: { resourceDID: "IVSUITE001" }
           }
       ]
   }
};


// SECTION 5 (Extended): Additional Error Response Examples
/**
* Error Response Handling Guide
*
* reservationDetails field behavior:
* 1. For successful responses (success: true):
*    - Always include reservationDetails
*    - Must contain all scheduled appointment details
*    - Include both startDateTime and endDateTime
*
* 2. For error responses (success: false):
*    - Completely omit reservationDetails
*    - Do not set to null or undefined
*    - Use message field in series to explain the error
*
* 3. For partial successes:
*    - Include reservationDetails with only the successfully scheduled appointments
*    - Mark success as true if any appointments were scheduled
*    - Include detailed messages about what succeeded and what failed
*/


// Additional error scenarios
const extendedErrorResponses: FindAvailableAppointmentsResponse[] = [
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "COMPLEX_SERIES",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Dependency conflict: Cannot schedule Multivitamin IVs before required Detox series"
       }],
       success: false
   },
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "RECURRING_SERIES",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Pattern conflict: Cannot satisfy '3 per week' requirement within available slots"
       }],
       success: false
   },
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "CLUSTERED_REQUEST",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Clustering constraints: Cannot meet minTimeBetweenAppointments requirement"
       }],
       success: false
   },
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "VALIDATION_ERROR",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Invalid request: Total requested duration exceeds maximum allowed per day"
       }],
       success: false
   }
];


// Example of a partial success response
const partialSuccessResponse: FindAvailableAppointmentsResponse = {
   clinicDID: "CLINIC123",
   series: [
       {
           seriesId: "PARTIAL_SUCCESS",
           appointments: [
               {
                   seriesId: "PARTIAL_SUCCESS",
                   occurrence: 1,
                   providerIdentifier: { clinicianDID: "DOCTOR789" },
                   appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
                   startTime: new Date("2024-12-30T10:00:00"),
                   durationMinutes: 30,
                   isReserved: true
               }
           ],
           completionStatus: "PARTIALLY_SCHEDULED",
           message: "Scheduled primary care visit but could not schedule requested IV therapy"
       }
   ],
   success: true,  // true because at least one appointment was scheduled
   reservationDetails: {
       patientDID: "PATIENT456",
       requestDate: new Date("2024-12-23"),
       requestingClinicianDID: "DOCTOR789",
       appointments: [
           {
               startDateTime: new Date("2024-12-30T10:00:00"),
               endDateTime: new Date("2024-12-30T10:30:00"),
               durationMinutes: 30,
               appointmentTypeCd: AppointmentTypeCd.PRIMARY_CARE_VISIT,
               providerIdentifier: { clinicianDID: "DOCTOR789" }
           }
       ]
   }
};


// Additional validation error examples
const validationErrors: FindAvailableAppointmentsResponse[] = [
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "VALIDATION_ERROR",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Invalid provider: Specified clinician not authorized for requested procedure"
       }],
       success: false
   },
   {
       clinicDID: "CLINIC123",
       series: [{
           seriesId: "VALIDATION_ERROR",
           appointments: [],
           completionStatus: "CANNOT_SCHEDULE",
           message: "Resource mismatch: IV therapy must be scheduled with resource, not clinician"
       }],
       success: false
   }
];


// Example of successful complex series scheduling with clustering
const complexSuccessResponse: FindAvailableAppointmentsResponse = {
   clinicDID: "CLINIC123",
   series: [
       {
           seriesId: "COMPLEX_SUCCESS",
           appointments: [
               // First day: Clustered appointments
               {
                   seriesId: "NEURO_SERIES",
                   occurrence: 1,
                   providerIdentifier: { resourceDID: "NEUROSCAN001" },
                   appointmentTypeCd: AppointmentTypeCd.NEUROPLASTICITY_SCAN,
                   startTime: new Date("2024-12-30T09:00:00"),
                   durationMinutes: 60,
                   isReserved: true
               },
               {
                   seriesId: "DETOX_SERIES",
                   occurrence: 1,
                   providerIdentifier: { resourceDID: "IVSUITE001" },
                   appointmentTypeCd: AppointmentTypeCd.HEAVY_METAL_DETOX_IV,
                   startTime: new Date("2024-12-30T10:30:00"),
                   durationMinutes: 120,
                   isReserved: true
               }
           ],
           completionStatus: "FULLY_SCHEDULED",
           message: "Successfully scheduled all series with clustering optimization"
       }
   ],
   success: true,
   reservationDetails: {
       patientDID: "PATIENT456",
       requestDate: new Date("2024-12-23"),
       requestingClinicianDID: "DOCTOR789",
       appointments: [
           {
               startDateTime: new Date("2024-12-30T09:00:00"),
               endDateTime: new Date("2024-12-30T10:00:00"),
               durationMinutes: 60,
               appointmentTypeCd: AppointmentTypeCd.NEUROPLASTICITY_SCAN,
               providerIdentifier: { resourceDID: "NEUROSCAN001" }
           },
           {
               startDateTime: new Date("2024-12-30T10:30:00"),
               endDateTime: new Date("2024-12-30T12:30:00"),
               durationMinutes: 120,
               appointmentTypeCd: AppointmentTypeCd.HEAVY_METAL_DETOX_IV,
               providerIdentifier: { resourceDID: "IVSUITE001" }
           }
       ]
   }
};
