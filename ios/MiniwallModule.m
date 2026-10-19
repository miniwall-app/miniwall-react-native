#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MiniwallModule, RCTEventEmitter)

RCT_EXTERN_METHOD(configure:(NSDictionary *)args)
RCT_EXTERN_METHOD(setAttributes:(NSDictionary *)args)
RCT_EXTERN_METHOD(present:(NSDictionary *)args resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(preload:(NSDictionary *)args resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(reportPurchase:(NSDictionary *)args)
RCT_EXTERN_METHOD(reset:(NSDictionary *)args)
RCT_EXTERN_METHOD(startAutoPlacements:(NSDictionary *)args)
RCT_EXTERN_METHOD(stopAutoPlacements)
RCT_EXTERN_METHOD(track:(NSDictionary *)args)
RCT_EXTERN_METHOD(reply:(NSString *)requestId value:(id)value)

@end
