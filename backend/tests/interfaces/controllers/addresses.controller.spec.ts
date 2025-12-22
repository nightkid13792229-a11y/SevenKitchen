/**
 * Addresses Controller API Tests
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { AddressesController } from 'src/addresses.controller';
import { UnauthorizedExceptionFilter } from 'src/common/unauthorized-exception.filter';
import {
  AddressService,
  ADDRESS_REPOSITORY,
} from 'src/application/address/address.service';
import { InMemoryAddressRepository } from 'src/infrastructure/repositories/in-memory-address.repository';
import { Address } from 'src/domain/address/address.entity';
import { JwtAuthService } from 'src/auth/jwt.service';
import { AuthGuard } from 'src/auth/auth.guard';

describe('AddressesController (e2e)', () => {
  let app: INestApplication;
  let addressRepository: InMemoryAddressRepository;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [AddressesController],
      providers: [
        AddressService,
        {
          provide: ADDRESS_REPOSITORY,
          useClass: InMemoryAddressRepository,
        },
        JwtAuthService,
        AuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new UnauthorizedExceptionFilter());

    addressRepository = moduleFixture.get(ADDRESS_REPOSITORY);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/addresses', () => {
    it('should return 401 when X-Customer-Id header is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .expect(200); // HTTP status is 200, but code in body is 401

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body.message).toContain('Unauthorized');
    });

    it('should return 200 with empty list when no addresses exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('X-Customer-Id', 'test-user-id')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toEqual([]);
    });

    it('should return 200 with address list', async () => {
      const userId = 'test-user-id';
      // Create test addresses
      const address1 = new Address(
        'addr-1',
        userId,
        '张三',
        '13800138000',
        { province: '广东省', city: '深圳市', district: '南山区' },
        '科技园南区123号',
        false,
      );
      const address2 = new Address(
        'addr-2',
        userId,
        '李四',
        '13900139000',
        { province: '广东省', city: '广州市', district: '天河区' },
        '天河路456号',
        true,
      );

      await addressRepository.save(address1);
      await addressRepository.save(address2);

      const response = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('X-Customer-Id', userId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('recipientName');
    });
  });

  describe('POST /api/v1/addresses', () => {
    it('should return 401 when X-Customer-Id header is missing', async () => {
      const validPayload = {
        recipientName: '张三',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: '科技园南区123号',
        isDefault: false,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .send(validPayload)
        .expect(200); // HTTP status is 200, but code in body is 401

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body.message).toContain('Unauthorized');
    });

    it('should return 201 with created address for valid input', async () => {
      const userId = 'test-user-id';
      const validPayload = {
        recipientName: '张三',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: '科技园南区123号',
        isDefault: false,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('X-Customer-Id', userId)
        .send(validPayload)
        .expect(201);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('userId', userId);
      expect(response.body.data).toHaveProperty('recipientName', '张三');
      expect(response.body.data).toHaveProperty('phone', '13800138000');
      expect(response.body.data).toHaveProperty('region');
      expect(response.body.data.region).toHaveProperty('province', '广东省');
      expect(response.body.data).toHaveProperty('detail', '科技园南区123号');
      expect(response.body.data).toHaveProperty('isDefault', false);
    });

    it('should return 400 for invalid payload', async () => {
      const invalidPayload = {
        recipientName: '', // Invalid: empty
        phone: '', // Invalid: empty
        region: {
          province: '', // Invalid: empty
          city: '深圳市',
          district: '南山区',
        },
        detail: '', // Invalid: empty
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('X-Customer-Id', 'test-user-id')
        .send(invalidPayload)
        .expect(400);

      // Should be validation error (400) or auth error if auth happens first
      expect([400, 200]).toContain(response.status);
    });

    it('should set as default and unset other defaults', async () => {
      const userId = 'test-user-id';
      // Create an existing default address
      const existingDefault = new Address(
        'addr-existing',
        userId,
        'Existing',
        '13700137000',
        { province: '广东省', city: '深圳市', district: '福田区' },
        '福田路789号',
        true,
      );
      await addressRepository.save(existingDefault);

      // Create a new address with isDefault=true
      const newAddressPayload = {
        recipientName: '新地址',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: '科技园南区123号',
        isDefault: true,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('X-Customer-Id', userId)
        .send(newAddressPayload)
        .expect(201);

      expect(response.body.data.isDefault).toBe(true);

      // Verify existing address is no longer default
      const existing = await addressRepository.findById('addr-existing');
      expect(existing?.isDefault).toBe(false);
    });
  });

  describe('PUT /api/v1/addresses/:id', () => {
    it('should return 200 with updated address', async () => {
      const userId = 'test-user-id';
      // Create an address first
      const address = new Address(
        'addr-update',
        userId,
        '原名称',
        '13800138000',
        { province: '广东省', city: '深圳市', district: '南山区' },
        '原地址',
        false,
      );
      await addressRepository.save(address);

      const updatePayload = {
        recipientName: '新名称',
        detail: '新地址',
      };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/addresses/${address.id}`)
        .set('X-Customer-Id', userId)
        .send(updatePayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty('recipientName', '新名称');
      expect(response.body.data).toHaveProperty('detail', '新地址');
      expect(response.body.data).toHaveProperty('phone', '13800138000'); // Unchanged
    });

    it('should return 404 for non-existent address', async () => {
      const updatePayload = {
        recipientName: '新名称',
      };

      const response = await request(app.getHttpServer())
        .put('/api/v1/addresses/non-existent-id')
        .send(updatePayload)
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toBeNull();
    });
  });

  describe('POST /api/v1/addresses/:id/set-default', () => {
    it('should return 200 and set address as default', async () => {
      const userId = 'test-user-id';
      // Create two addresses
      const address1 = new Address(
        'addr-1',
        userId,
        '地址1',
        '13800138000',
        { province: '广东省', city: '深圳市', district: '南山区' },
        '地址1详情',
        true, // Initially default
      );
      const address2 = new Address(
        'addr-2',
        userId,
        '地址2',
        '13900139000',
        { province: '广东省', city: '广州市', district: '天河区' },
        '地址2详情',
        false, // Not default
      );

      await addressRepository.save(address1);
      await addressRepository.save(address2);

      // Set address2 as default
      const response = await request(app.getHttpServer())
        .post(`/api/v1/addresses/${address2.id}/set-default`)
        .set('X-Customer-Id', userId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty('isDefault', true);

      // Verify address1 is no longer default
      const updatedAddress1 = await addressRepository.findById('addr-1');
      expect(updatedAddress1?.isDefault).toBe(false);

      // Verify address2 is now default
      const updatedAddress2 = await addressRepository.findById('addr-2');
      expect(updatedAddress2?.isDefault).toBe(true);
    });

    it('should return 404 for non-existent address', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/addresses/non-existent-id/set-default')
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toBeNull();
    });
  });

  describe('Customer Isolation', () => {
    it('should isolate addresses by customer', async () => {
      const customerA = 'customer-a';
      const customerB = 'customer-b';

      // Create address for customer A
      const addressPayloadA = {
        recipientName: 'Customer A Address',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: 'Address A',
        isDefault: false,
      };

      const createResponseA = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('X-Customer-Id', customerA)
        .send(addressPayloadA)
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const addressIdA = createResponseA.body.data.id;

      // Create address for customer B
      const addressPayloadB = {
        recipientName: 'Customer B Address',
        phone: '13900139000',
        region: {
          province: '广东省',
          city: '广州市',
          district: '天河区',
        },
        detail: 'Address B',
        isDefault: false,
      };

      await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('X-Customer-Id', customerB)
        .send(addressPayloadB)
        .expect(201);

      // List addresses as customer A - should only see A's address
      const listResponseA = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('X-Customer-Id', customerA)
        .expect(200);

      expect(listResponseA.body.code).toBe(0);
      expect(listResponseA.body.data).toHaveLength(1);
      expect(listResponseA.body.data[0].id).toBe(addressIdA);
      expect(listResponseA.body.data[0].recipientName).toBe(
        'Customer A Address',
      );

      // List addresses as customer B - should only see B's address
      const listResponseB = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('X-Customer-Id', customerB)
        .expect(200);

      expect(listResponseB.body.code).toBe(0);
      expect(listResponseB.body.data).toHaveLength(1);
      expect(listResponseB.body.data[0].recipientName).toBe(
        'Customer B Address',
      );
    });
  });
});
