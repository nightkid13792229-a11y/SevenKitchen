import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RecipeAgentRunService } from '../../../src/application/recipe-designer/agent/recipe-agent-run.service';
import { AuthGuard, type RequestUser } from '../../../src/interfaces/auth';
import { RecipeAgentController } from '../../../src/interfaces/controllers/recipe-agent.controller';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';

const DRAFT_ID = 'draft-1';
const SESSION_ID = 'session-1';
const USER: RequestUser = {
  userId: 'user-1',
  customerId: 'customer-1',
  role: 'STAFF',
};
const ACTOR = {
  userId: 'user-1',
  role: 'STAFF',
  customerId: 'customer-1',
};

function makeRunService() {
  return {
    start: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
    getSessionView: jest.fn(),
  };
}

describe('RecipeAgentController', () => {
  let runService: ReturnType<typeof makeRunService>;
  let controller: RecipeAgentController;

  beforeEach(() => {
    runService = makeRunService();
    controller = new RecipeAgentController(
      runService as unknown as RecipeAgentRunService,
    );
    jest.clearAllMocks();
  });

  it('requires authentication at class level and staff guard on every route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, RecipeAgentController),
    ).toEqual([AuthGuard]);

    for (const method of ['start', 'getSession', 'stop', 'answer'] as const) {
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          RecipeAgentController.prototype[method],
        ),
      ).toEqual([StaffGuard]);
    }
  });

  describe('start', () => {
    it('trims the message and passes draft id and actor to the run service', async () => {
      runService.start.mockResolvedValue({ sessionId: SESSION_ID });

      await expect(
        controller.start(DRAFT_ID, { message: '  帮我看看这份草稿  ' }, USER),
      ).resolves.toEqual({ sessionId: SESSION_ID });

      expect(runService.start).toHaveBeenCalledTimes(1);
      expect(runService.start).toHaveBeenCalledWith({
        draftId: DRAFT_ID,
        actor: ACTOR,
        message: '帮我看看这份草稿',
      });
    });

    it.each([
      ['blank', { message: '   ' }],
      ['missing', {}],
    ])('rejects a %s message without starting a run', async (_label, body) => {
      const start = controller.start(DRAFT_ID, body, USER);

      await expect(start).rejects.toBeInstanceOf(BadRequestException);
      await expect(start).rejects.toThrow('消息不能为空');
      expect(runService.start).not.toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('delegates to the run service with the actor and returns its view', async () => {
      const view = {
        session: { id: SESSION_ID },
        messages: [{ id: 'message-1' }],
      };
      runService.getSessionView.mockResolvedValue(view);

      await expect(controller.getSession(DRAFT_ID, USER)).resolves.toEqual(
        view,
      );
      expect(runService.getSessionView).toHaveBeenCalledTimes(1);
      expect(runService.getSessionView).toHaveBeenCalledWith(DRAFT_ID, ACTOR);
    });
  });

  describe('stop', () => {
    it('delegates to the run service with the actor', async () => {
      runService.stop.mockResolvedValue(undefined);

      await expect(controller.stop(SESSION_ID, USER)).resolves.toBeUndefined();
      expect(runService.stop).toHaveBeenCalledTimes(1);
      expect(runService.stop).toHaveBeenCalledWith(SESSION_ID, ACTOR);
    });
  });

  describe('answer', () => {
    it('trims the message and resumes the run with the actor', async () => {
      runService.resume.mockResolvedValue(undefined);

      await expect(
        controller.answer(SESSION_ID, { message: '  继续  ' }, USER),
      ).resolves.toBeUndefined();
      expect(runService.resume).toHaveBeenCalledTimes(1);
      expect(runService.resume).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        actor: ACTOR,
        message: '继续',
      });
    });

    it('rejects an empty answer without resuming the run', async () => {
      await expect(
        controller.answer(SESSION_ID, { message: '   ' }, USER),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(runService.resume).not.toHaveBeenCalled();
    });
  });
});
