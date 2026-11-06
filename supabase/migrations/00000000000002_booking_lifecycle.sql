-- Add new booking lifecycle statuses
-- OCCUPIED:                Guest has checked in
-- VACATED:                 Guest has checked out
-- CANCELLATION_REQUESTED:  Requester wants to cancel an approved booking (pending manager approval)
-- CANCELLATION_APPROVED:   Manager approved the cancellation, rooms released

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'OCCUPIED' AFTER 'APPROVED';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'VACATED' AFTER 'OCCUPIED';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'CANCELLATION_REQUESTED' AFTER 'CANCELLED';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'CANCELLATION_APPROVED' AFTER 'CANCELLATION_REQUESTED';
