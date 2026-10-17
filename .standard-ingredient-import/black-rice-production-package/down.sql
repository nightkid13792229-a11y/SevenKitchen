-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('316aaac1-6758-4208-b56e-5acb77db92be', 'a1148f7c-adfc-418b-98e0-60a86bb5a1fd');
DELETE FROM nutrition_food WHERE id IN ('a89a730b-829b-4d39-93d7-910dcfe99cf6', '066eb6a5-f12c-4da9-a761-97d54fff65c3');
DELETE FROM ingredient WHERE id IN ('36131203-2980-46b8-ac3c-7d38a4f713ae');
